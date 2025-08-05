# crosscode-typedef-inserter

### NOTE: This only adds types to code that is typed in [ultimate-crosscode-typedefs](https://github.com/krypciak/ultimate-crosscode-typedefs)! ([See coverage](https://github.com/krypciak/crosscode-typedef-percentage))

| From | To |
| ------| --------- |
| ![image](https://github.com/user-attachments/assets/e2bfa48c-6377-49c9-9ae7-3490f76c64e0) | ![image](https://github.com/user-attachments/assets/a3ec0e40-17cc-42e8-9901-0ba493d35a1f) |
| ![image](https://github.com/user-attachments/assets/f47a0dca-50c9-4612-8a2f-2a46440b9e97) | ![image](https://github.com/user-attachments/assets/e34ebc49-d3cf-4b25-826c-b56b9bf66f7f) |

## ES6-fication (using [lebab](https://github.com/lebab/lebab))
- `func: function() {` => `func() {`
- `for (... of ...)` sometimes
- template strings
- changing `var` to `let` or `const` where possible
- splitting annoying multi-line variable declarations into separate declarations
- `game.compiled.js` becomes 0.3M smaller

| From | To |
| ------| --------- |
| ![image](https://github.com/user-attachments/assets/278962be-e825-4a32-9b80-3e175fd3320c) | ![image](https://github.com/user-attachments/assets/87931fbb-4a33-46e6-9840-34ae55b4bf1a) |

## Running

Edit the `.env` file to include paths. An example `.env` can look like:  
```bash
TYPEDEF_REPO=./game-compiled/ultimate-crosscode-typedefs
GAME_COMPILED_JS=./game-compiled/game.compiled.js
OUTPUT_GAME_COMPILED_JS=./game-compiled/game.compiled.typed.js
```

Then run:  

```bash
npm start
```

Automated script:
```bash
#/bin/sh
set -e
game_compied_js_path="MY_CROSSCODE_DIR/assets/js/game.compiled.js"

git clone https://github.com/krypciak/crosscode-typedef-inserter
cd crosscode-typedef-inserter
mkdir game-compiled
cd game-compiled
cp "$game_compiled_js_path" game.compiled.js
prettier -w game.compiled.js

git clone https://github.com/krypciak/ultimate-crosscode-typedefs
cd ultimate-crosscode-typedefs
npm install
cd ..
cd ..
sed -i 's/TYPEDEF_REPO=/TYPEDEF_REPO=.\/game-compiled\/ultimate-crosscode-typedefs/g' .env
npm install
npm start
```
