module.exports = {
  root: true, // 여기서 상위 폴더로 설정 찾기를 멈춥니다.
  extends: ['./index.js'], // 방금 작성하신 index.js를 자신의 린트 룰로 사용합니다.
  ignorePatterns: ['.eslintrc.js', 'index.js'],
};