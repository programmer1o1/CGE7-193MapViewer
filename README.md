<img align="right" src="src/assets/logo.png">

# <a href="https://noclip.website">noclip</a>

The reverse engineering of model formats was done by many people. See the application for full credits.

# INTERLOPER FORK

This is a fork of the noclip.website intended for maps related to the Interloper ARG by Anomidae.<br>
Created by qbyte. Modified by programmer1o1. Almost all things should work.

## Contributing

[Official noclip.website Github](https://github.com/magcius/noclip.website)<br>
[Official noclip.website Discord Server](https://discord.gg/bkJmKKv)<br>
[Official Interloper Discord Server](https://discord.gg/H4X9GxZw)

## Compile Guide

This project is a fork of [noclip.website](https://github.com/magcius/noclip.website), and is built using Rust (for WebAssembly) and TypeScript (via pnpm).

### Prerequisites

- [Rustup](https://rustup.rs) (includes Cargo and rustc)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/) (though it's not maintained anymore but it should work)
- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/) package manager

> [!NOTE]
> Install instructions vary by platform and are described below.

---

### Windows

1. Install Rust using [Rustup](https://rustup.rs/).
2. Install wasm target:

    ```sh
    rustup target add wasm32-unknown-unknown
    ```

3. Install wasm-pack using `cargo`:

    ```sh
    cargo install wasm-pack
    ```

4. Install Node.js from [https://nodejs.org/](https://nodejs.org/).
5. Install pnpm globally:

    ```sh
    npm install -g pnpm
    ```

6. Clone the repository and enter the directory:

    ```sh
    git clone https://github.com/programmer1o1/CGE7-193MapViewer.git
    cd CGE7-193MapViewer
    ```

7. Build the Rust code (WebAssembly component):

    ```sh
    cd rust
    wasm-pack build --target web
    cd ..
    ```

8. Install npm dependencies and start the development server:

    ```sh
    pnpm install
    pnpm start
    ```

9. Open `http://localhost:3000` in your browser.

---

### Linux & macOS

1. Install Rust using [Rustup](https://rustup.rs/):

    ```sh
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    source $HOME/.cargo/env
    ```

2. Add the wasm32-unknown-unknown target:

    ```sh
    rustup target add wasm32-unknown-unknown
    ```

3. Install wasm-pack:

    ```sh
    cargo install wasm-pack
    ```

4. Install Node.js (use your OS package manager or install manually):

    - macOS:

      ```sh
      brew install node
      ```

    - Ubuntu:

      ```sh
      sudo apt update
      sudo apt install nodejs npm
      ```

5. Install pnpm:

    ```sh
    npm install -g pnpm
    ```

6. Clone the repository and navigate into it:

    ```sh
    git clone hhttps://github.com/programmer1o1/CGE7-193MapViewer.git
    cd CGE7-193MapViewer
    ```

7. Build the Rust WASM code:

    ```sh
    cd rust
    wasm-pack build --target web
    cd ..
    ```

8. Install dependencies and run the dev server:

    ```sh
    pnpm install
    pnpm start
    ```

9. Visit `http://localhost:3000` (or whichever address is shown in your terminal).

---

### Building for Production

To build a production-optimized version of the site:

```sh
pnpm build
```

The output will be placed in the dist/ directory.

---

## Controls

Key | Description
-|-
`Z` | Show/hide all UI
`T` | Open "Games" list
`W`/`A`/`S`/`D` or Arrow Keys | Move camera
Hold `Shift` | Make camera move faster
Hold `\` | Make camera move slower
`E` or `Page Up` or `Space` | Move camera up
`Q` or `Page Down` or `Ctrl+Space` | Move camera down
`Scroll Wheel` | Adjust camera movement speed (in WASD camera mode; instead changes the zoom level in Orbit or Ortho camera modes)
`I`/`J`/`K`/`L` | Tilt camera
`O` | Rotate camera clockwise
`U` | Rotate camera counterclockwise
`1`/`2`/`3`/`4`/`5`/`6`/`7`/`8`/`9` | Load savestate
`Shift`+`1`/`2`/`3`/`4`/`5`/`6`/`7`/`8`/`9` | Save savestate
`Numpad 3` | Export save states
`Numpad 7` or `[` | Take screenshot
`.` | Freeze/unfreeze time
`,` | Hold to slowly move through time
`F9` | Reload current scene
`B` | Reset camera position back to origin
`R` | Start/stop automatic orbiting (requries Orbit or Ortho camera modes)
`Numpad 5` | Immediately stop all orbiting (requries Orbit or Ortho camera modes)
`Numpad 2`/`Numpad 4`/`Numpad 6`/`Numpad 8` | Snap view to front/left/right/top view (requires Orbit camera mode)
`F` | Not sure what this key does, let me know if you figure it out
