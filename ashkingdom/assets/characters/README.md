# 캐릭터 에셋 (힉스필드 생성)

| 파일 | 내용 | 생성 |
|---|---|---|
| `base_male_ref.png` | 남성 기본 캐릭터(기본 레이어: 민소매·반바지), A자세, 2K | Higgsfield `gpt_image_2_6` 고품질 |
| `base_female_ref.png` | 여성 기본 캐릭터(기본 레이어: 스포츠 상의·반바지), A자세, 2K | Higgsfield `gpt_image_2_6` 고품질 |
| `hero_M.glb` / `hero_F.glb` | 위 이미지를 3D로 변환(텍스처·PBR·휴머노이드 뼈대·걷기 애니메이션) | Higgsfield `image_to_3d`(Meshy) |

- 모든 인물은 실존 인물을 닮지 않은 오리지널 캐릭터입니다.
- 게임은 `hero_*.glb`가 있으면 자동으로 플레이어 캐릭터를 이 모델로 그립니다(`js/r3d.js` `preloadHeroes`). 없으면 절차적 캐릭터로 대체됩니다.
- 기본 레이어(속옷 수준)는 앱 마켓 연령 등급과 생성 모델 안전 정책 때문에 완전 탈의 대신 사용합니다.
