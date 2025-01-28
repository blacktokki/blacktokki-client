[Original repository(expo-monorepo-example)](https://github.com/byCedric/expo-monorepo-example/tree/3bd9342fce291501dd4cf44cfaa8fe046f8b5002)

## 🚀 How to use it

To set this repository up, you need an Expo account [with access to EAS](https://docs.expo.io/eas/). After that, you need to run these commands.

- `$ yarn` - This installs all required Node libraries using Yarn Workspaces
- `$ yarn build` - To precompile the packages to publish them to NPM and/or use them in your apps.

### Starting apps

After the initial setup, you can start the apps from their app directories. Or you can use `yarn workspace <name> expo start` command, see `scripts` in [`package.json`](./package.json).
- `$ yarn <name> expo start` - This will execute `expo start` in the managed app.
