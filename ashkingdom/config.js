// 서버 연결 설정 — 게임 전용 Supabase 프로젝트 'ashkingdom'(공개용 값만). anon 키는 '공개 키'라 노출돼도 되며, 실제 보호는 DB 보안 규칙(RLS·트리거)이 한다.
// 서버 없이 오프라인으로 돌리려면 이 줄을 지우거나 window.ASHK_CONFIG = null 로.
window.ASHK_CONFIG = {
  supabaseUrl: "https://tkabybwliylcwgcweuot.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrYWJ5YndsaXlsY3dnY3dldW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQwNTgyODAsImV4cCI6MjEwOTYzNDI4MH0.HaBddwYZHZ9XhnPVkFC_IB8sTlEGMyfRaYGzRO1Cs1Q",
};
