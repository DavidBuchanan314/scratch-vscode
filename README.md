# scratch-vscode

Preview Scratch projects (`.sb3`) inside vscode - with live reload.

This is useful if you're writing code that generates Scratch code, and you want
a quick feedback loop.

The code is a bit janky because I don't really know JS or TypeScript, and I took one
of the vscode extension samples and hacked out everything I didn't think I needed.

<img width="1512" alt="image" src="https://user-images.githubusercontent.com/13520633/174917933-384f7422-8879-4e58-b973-133b30f4b5c2.png">

## Current Limitations

- Variable/List monitors are not yet supported.
- The "ask and wait" block doesn't work yet.
- No sound on music blocks (I need to figure out how to load the assets).

## Planned Features

- Viewing the scratch blocks contained within a `.sprite3` file.
- A way to log messages from a scratch project.
- Debugger integration? Being able to view variables at least, would be useful.

## Installation

Grab the `.vsix` file from the releases page, then go to vscode -> Extensions -> ... -> Install from VSIX

## Testing/Development

If you want to test/debug it, these steps should hopefully work:

```
git clone https://github.com/DavidBuchanan314/scratch-vscode
cd scratch-vscode
make install
npm run compile
[press F5 in vscode]
```

To build the installable `.vsix` file:

```
vsce package
```
