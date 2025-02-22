# crosscode-typedef-inserter

### NOTE: This only adds types to code that is typed in [ultimate-crosscode-typedefs](https://github.com/krypciak/ultimate-crosscode-typedefs)! ([See coverage](https://github.com/krypciak/crosscode-typedef-percentage))

| From | To |
| ------| --------- |
| ![image](https://github.com/user-attachments/assets/80a1c77d-f654-4f61-8e60-ea744dedaea3) |  ![image](https://github.com/user-attachments/assets/bdd75576-ea31-42cc-9f6a-b1976bdae1d3) |
| ![image](https://github.com/user-attachments/assets/6ef02e5f-6bce-4157-a8b7-245cc8506ec4) | ![image](https://github.com/user-attachments/assets/b03e683a-c4ee-483f-b9fa-73bed3c37d62) |
| ![image](https://github.com/user-attachments/assets/c251d84c-a8f1-4463-9a2c-08f532f5d7de) | ![image](https://github.com/user-attachments/assets/40a48826-ff3f-49d0-8615-14840bb75f2f) |

## Running

Edit the `.env` file to include paths. An example `.env` can look like:  
```bash
TYPEDEF_REPO=./ultimate-crosscode-typedefs
GAME_COMPILED_JS=./game.compiled.js
OUTPUT_GAME_COMPILED_JS=./game.compiled.typed.js
```

Then run:  

```bash
npm install
npm start
```
