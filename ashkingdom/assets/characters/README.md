# 캐릭터 에셋 (힉스필드 생성)

| 파일 | 내용 | 생성 |
|---|---|---|
| `base_male_ref.png` | 남성 기본 캐릭터(기본 레이어: 민소매·반바지), A자세, 2K | Higgsfield `gpt_image_2_6` 고품질 |
| `base_female_ref.png` | 여성 기본 캐릭터(기본 레이어: 스포츠 상의·반바지), A자세, 2K | Higgsfield `gpt_image_2_6` 고품질 |
| `hero_M.glb` / `hero_F.glb` | 위 이미지를 3D로 변환(텍스처·PBR·휴머노이드 뼈대·걷기 애니메이션) | Higgsfield `image_to_3d`(Meshy) |

- 모든 인물은 실존 인물을 닮지 않은 오리지널 캐릭터입니다.
- 게임은 `hero_*.glb`가 있으면 자동으로 플레이어 캐릭터를 이 모델로 그립니다(`js/r3d.js` `preloadHeroes`). 없으면 절차적 캐릭터로 대체됩니다.
- 기본 레이어(속옷 수준)는 앱 마켓 연령 등급과 생성 모델 안전 정책 때문에 완전 탈의 대신 사용합니다.

## 용량 최적화
- 원본 GLB 각 13MB → 텍스처를 1024px WebP로 변환해 각 약 2.7MB(메시·뼈대 24개·애니메이션은 그대로).
  `npx @gltf-transform/cli optimize in.glb out.glb --compress false --simplify false --texture-compress webp --texture-size 1024`
- 원본(13MB)은 힉스필드 계정의 생성 기록에서 다시 받을 수 있습니다.

## 동작(모션) 추가 방법
- `anims/<이름>.glb` 를 넣고 `anims/manifest.json` 의 `clips` 에 이름을 추가하면 자동으로 쓰입니다.
- 이름: `idle`(대기) `run`(달리기) `attack`(근접 공격) `shoot`(사격) `gather`(채집) `pickup`(줍기) `hit`(피격) `death`(사망) `ride`(승마) `cheer`(환호) `swim`(수영). `walk`(걷기)는 기본 모델에 포함.
- 모든 모델이 같은 뼈대 이름(Hips, Spine…, RightHand 등 24개)을 쓰므로 **동작 하나를 모든 캐릭터·의상 모델이 공유**합니다.
- 손 방향 교정: 원본 이미지가 손바닥이 앞을 향한 자세라, 아래팔·손을 80° 비틀어 자연스럽게 보정합니다(`GlbHuman.WRIST_FIX`).
