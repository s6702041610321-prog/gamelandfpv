import * as THREE from 'three';
import { soundManager } from './audio.js';

export class FPVController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    // Movement parameters
    this.walkSpeed = 7.0;
    this.sprintSpeed = 13.0;
    this.crouchSpeed = 3.5;
    this.jumpForce = 8.5;
    this.gravity = -22.0;

    // Camera height state
    this.standingHeight = 1.7;
    this.crouchHeight = 0.9;
    this.currentHeight = this.standingHeight;

    // Spatial State
    this.position = new THREE.Vector3(0, 5, 10);
    this.velocity = new THREE.Vector3();
    this.isGrounded = false;

    // Rotation angles (Euler angles in radians)
    this.yaw = 0;
    this.pitch = 0;

    // Keyboard state
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      crouch: false,
      jump: false
    };

    // Pointer Lock & Mouse sensitivity
    this.mouseSensitivity = 0.0022;
    this.isLocked = false;

    // Collision Raycasters
    this.downRaycaster = new THREE.Raycaster();
    this.horizontalRaycasters = [
      new THREE.Raycaster(), // Forward
      new THREE.Raycaster(), // Backward
      new THREE.Raycaster(), // Left
      new THREE.Raycaster()  // Right
    ];

    this.collidableObjects = [];

    this.initEvents();
  }

  initEvents() {
    // Mouse movement when pointer locked
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      const movementX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
      const movementY = e.movementY || e.mozMovementY || e.webkitMovementY || 0;

      this.yaw -= movementX * this.mouseSensitivity;
      this.pitch -= movementY * this.mouseSensitivity;

      // Clamp pitch to prevent camera flipping
      const maxPitch = Math.PI / 2 - 0.05;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    });

    // Keyboard down & up
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      this.onKeyChange(e.code, true);
    });

    window.addEventListener('keyup', (e) => {
      this.onKeyChange(e.code, false);
    });
  }

  onKeyChange(code, isPressed) {
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = isPressed;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = isPressed;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = isPressed;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = isPressed;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.sprint = isPressed;
        break;
      case 'KeyC':
      case 'ControlLeft':
      case 'ControlRight':
        this.keys.crouch = isPressed;
        break;
      case 'Space':
        if (isPressed && (this.isGrounded || this.position.y <= 0.2)) {
          this.velocity.y = this.jumpForce;
          this.isGrounded = false;
          soundManager.playJump();
        }
        this.keys.jump = isPressed;
        break;
    }
  }

  setCollidableObjects(objects) {
    this.collidableObjects = objects;
  }

  requestLock() {
    try {
      if (this.domElement && this.domElement.requestPointerLock) {
        const res = this.domElement.requestPointerLock();
        if (res && typeof res.catch === 'function') {
          res.catch((err) => {
            console.warn('Pointer lock request catch:', err);
          });
        }
      }
    } catch (e) {
      console.warn('Pointer lock request exception:', e);
    }
  }

  update(delta) {
    if (delta > 0.1) delta = 0.1; // Cap large delta frames

    // 1. Update Camera Rotation from Yaw & Pitch
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.x = this.pitch;
    euler.y = this.yaw;
    this.camera.quaternion.setFromEuler(euler);

    // 2. Determine target height & lerp camera height
    const targetHeight = this.keys.crouch ? this.crouchHeight : this.standingHeight;
    this.currentHeight += (targetHeight - this.currentHeight) * Math.min(delta * 12, 1);

    // 3. Movement speed selection
    let speed = this.walkSpeed;
    if (this.keys.crouch) speed = this.crouchSpeed;
    else if (this.keys.sprint) speed = this.sprintSpeed;

    // 4. Calculate Forward & Right directions in 2D Plane
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).normalize();

    // Input Movement Vector
    const moveDir = new THREE.Vector3();
    if (this.keys.forward) moveDir.add(forward);
    if (this.keys.backward) moveDir.sub(forward);
    if (this.keys.right) moveDir.add(right);
    if (this.keys.left) moveDir.sub(right);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
    }

    // Apply Acceleration & Friction to horizontal velocity
    const targetVx = moveDir.x * speed;
    const targetVz = moveDir.z * speed;
    const damping = Math.min(delta * 12.0, 1.0);

    this.velocity.x += (targetVx - this.velocity.x) * damping;
    this.velocity.z += (targetVz - this.velocity.z) * damping;

    // Apply Gravity
    this.velocity.y += this.gravity * delta;

    // 5. Horizontal Collisions (Wall Detection - ignores floor slopes)
    const playerCenter = this.position.clone().add(new THREE.Vector3(0, this.currentHeight * 0.5, 0));
    const nextHorizontalMove = new THREE.Vector3(this.velocity.x * delta, 0, this.velocity.z * delta);
    const moveDist = nextHorizontalMove.length();

    if (moveDist > 0.001 && this.collidableObjects.length > 0) {
      const dir = nextHorizontalMove.clone().normalize();
      const raycaster = new THREE.Raycaster(playerCenter, dir, 0, moveDist + 0.5);
      const hits = raycaster.intersectObjects(this.collidableObjects, true);

      // Only block horizontal movement if hitting a steep wall (face normal y < 0.7)
      const wallHit = hits.find(h => h.face && Math.abs(h.face.normal.y) < 0.7);
      if (wallHit) {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }
    }

    // Apply Position Increment
    this.position.x += this.velocity.x * delta;
    this.position.z += this.velocity.z * delta;
    this.position.y += this.velocity.y * delta;

    // 6. Vertical Collision (Ground Check Raycast - ONLY snap when falling/moving down)
    const rayOrigin = new THREE.Vector3(this.position.x, this.position.y + 0.8, this.position.z);
    this.downRaycaster.set(rayOrigin, new THREE.Vector3(0, -1, 0));

    if (this.collidableObjects.length > 0) {
      const intersects = this.downRaycaster.intersectObjects(this.collidableObjects, true);

      // Find the first valid ground surface below feet
      let validGroundHit = null;
      for (let i = 0; i < intersects.length; i++) {
        const hit = intersects[i];
        if (hit.point && hit.point.y <= this.position.y + 0.3) {
          validGroundHit = hit;
          break;
        }
      }

      if (validGroundHit) {
        const groundHeight = validGroundHit.point.y;
        // CRITICAL FIX: Only snap to ground when falling down (velocity.y <= 0)
        if (this.velocity.y <= 0 && this.position.y <= groundHeight + 0.15) {
          this.position.y = groundHeight;
          this.velocity.y = 0;
          this.isGrounded = true;
        } else {
          this.isGrounded = false;
        }
      } else {
        if (this.velocity.y <= 0 && this.position.y <= 0) {
          this.position.y = 0;
          this.velocity.y = 0;
          this.isGrounded = true;
        } else {
          this.isGrounded = false;
        }
      }
    } else {
      if (this.velocity.y <= 0 && this.position.y <= 0) {
        this.position.y = 0;
        this.velocity.y = 0;
        this.isGrounded = true;
      }
    }

    // Safety check against NaN
    if (isNaN(this.position.x)) this.position.x = 0;
    if (isNaN(this.position.y)) this.position.y = 1.7;
    if (isNaN(this.position.z)) this.position.z = 15;

    // Footstep audio trigger when moving on ground
    const currentHorizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.isGrounded && currentHorizSpeed > 1.0 && this.isLocked) {
      soundManager.playFootstep(this.keys.sprint);
    }

    // 7. Update Camera Position
    this.camera.position.set(
      this.position.x,
      this.position.y + this.currentHeight,
      this.position.z
    );
  }

  getSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  getStateString() {
    if (!this.isGrounded) return 'JUMPING';
    if (this.keys.crouch) return 'CROUCHING';
    if (this.keys.sprint && this.getSpeed() > 2) return 'SPRINTING';
    if (this.getSpeed() > 0.5) return 'WALKING';
    return 'IDLE';
  }
}
