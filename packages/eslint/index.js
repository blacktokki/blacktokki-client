module.exports = {
  extends: 'eslint-config-universe',
  // do some additional things with it
  rules: {
    'prettier/prettier': ['error', { endOfLine: 'auto' }],
  },
  settings: {
    // 중요: import 관련 규칙들이 react-native 라이브러리 내부를 파싱하지 않도록 무시 목록에 추가합니다.
    'import/ignore': [
      'react-native'
    ],
  },
};
