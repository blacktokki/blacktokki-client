# blacktokki-client

blacktokki-client는 Blacktokki 에코시스템의 React Native 및 Expo 기반 크로스 플랫폼 프론트엔드 모노레포입니다.

## 연관 프로젝트

[원본 repository(expo-monorepo-example)](https://github.com/byCedric/expo-monorepo-example/tree/3bd9342fce291501dd4cf44cfaa8fe046f8b5002)

## Installation

패키지 매니저 [Yarn](https://yarnpkg.com/)을 사용하여 의존성을 설치하고 패키지를 빌드합니다.

```bash
git clone https://github.com/blacktokki/blacktokki-client.git
cd blacktokki-client
yarn
yarn build
```

## Usage

Yarn Workspaces 명령어를 통해 각 플랫폼별 앱을 실행합니다.

```bash
# Notebook 웹 실행
yarn notebook yarn web

# Notebook 모바일(Android / iOS) 실행
yarn notebook yarn android
yarn notebook yarn ios
```

## Contributing

본 프로젝트는 개인 프로젝트로 외부 기여(Pull Request)나 기능 제안을 받지 않습니다. 필요한 경우 자유롭게 Fork하여 사용하시기 바랍니다.

## License

[MIT](LICENSE.md)
