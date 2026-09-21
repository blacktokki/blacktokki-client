const { execSync } = require('child_process');

console.log('🤖 AI 에이전트 스킬 설치를 시작합니다...');

const skills = [
  'junh0328/harness-diagnostics',
  'skillrecordings/adr-skill',
];

for (const skill of skills) {
  try {
    execSync(`npx --yes skills add ${skill} -y`, { stdio: 'inherit' });
  } catch (error) {
    console.error(`❌ 스킬 설치 실패 (${skill}):`, error.message);
    process.exit(1);
  }
}

console.log('✅ 모든 스킬 설치가 완료되었습니다!');
