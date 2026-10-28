# gamelandfpv - 3D FPV Low Poly World Tour

เว็บ 3D FPV Walkthrough Showcase โลก Low Poly สร้างด้วย Three.js + Vite

## ตัวละครใหม่: Low Poly Red Deer Stag 🦌
- โมเดล: `public/LowPoly_Animal.glb` (ปั้นด้วย Blender Python API, ~2,078 triangles, 11 materials)
- มีแอนิเมชัน Idle (หูกระดิก + หางสะบัด) เล่นด้วย `THREE.AnimationMixer`
- ยืนอยู่บนเนินลาดตรงหน้าจุดเกิดผู้เล่น ~13 m (เอียงตามความลาดชัน 5.6° ให้กีบแตะพื้นทั้ง 4)
- ตั้งค่าตำแหน่ง/การหมุน/สเกลได้ที่ `STAG_CONFIG` ใน `src/main.js`
- ผู้เล่นเดินชนกวางได้ (เพิ่มเข้า collidable objects)

## Run locally
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # output -> dist/
npm run preview  # ทดสอบไฟล์ build
```

## Netlify Build Settings
- **Build Command**: `npm run build`
- **Publish Directory**: `dist`
