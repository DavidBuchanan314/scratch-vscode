(function () {
	const VirtualMachine = require('scratch-vm');
	const ScratchStorage = require('scratch-storage');
	const ScratchRender = require('scratch-render');
	const AudioEngine = require('scratch-audio');
	const ScratchSVGRenderer = require('scratch-svg-renderer');

	const Scratch = window.Scratch = window.Scratch || {};


	console.log("Hello, console");
	console.log(VirtualMachine);

	const vm = new VirtualMachine();
	Scratch.vm = vm;

	const storage = new ScratchStorage();
	vm.attachStorage(storage);

	const canvas = document.getElementById('scratch-stage');
	const renderer = new ScratchRender(canvas);
	Scratch.renderer = renderer;
	vm.attachRenderer(renderer);
	const audioEngine = new AudioEngine();
	vm.attachAudioEngine(audioEngine);
	vm.attachV2BitmapAdapter(new ScratchSVGRenderer.BitmapAdapter());

	// Feed mouse events as VM I/O events.
	document.addEventListener('mousemove', e => {
		const rect = canvas.getBoundingClientRect();
		const coordinates = {
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
			canvasWidth: rect.width,
			canvasHeight: rect.height
		};
		Scratch.vm.postIOData('mouse', coordinates);
	});
	canvas.addEventListener('mousedown', e => {
		const rect = canvas.getBoundingClientRect();
		const data = {
			isDown: true,
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
			canvasWidth: rect.width,
			canvasHeight: rect.height
		};
		Scratch.vm.postIOData('mouse', data);
		e.preventDefault();
	});
	canvas.addEventListener('mouseup', e => {
		const rect = canvas.getBoundingClientRect();
		const data = {
			isDown: false,
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
			canvasWidth: rect.width,
			canvasHeight: rect.height
		};
		Scratch.vm.postIOData('mouse', data);
		e.preventDefault();
	});

	// Feed keyboard events as VM I/O events.
	document.addEventListener('keydown', e => {
		console.log("keydown", e);
		// Don't capture keys intended for Blockly inputs.
		if (e.target !== document && e.target !== document.body) {
			return;
		}
		Scratch.vm.postIOData('keyboard', {
			keyCode: e.keyCode,
			isDown: true
		});
		e.preventDefault();
	});
	document.addEventListener('keyup', e => {
		// Always capture up events,
		// even those that have switched to other targets.
		Scratch.vm.postIOData('keyboard', {
			keyCode: e.keyCode,
			isDown: false
		});
		// E.g., prevent scroll.
		if (e.target !== document && e.target !== document.body) {
			e.preventDefault();
		}
	});

	// Run threads
	vm.start();

	const vscode = acquireVsCodeApi();

	window.addEventListener("message", (event) => {
		const message = event.data;
		console.log("got message", message);
		switch (message.type) {
			case 'init':
				vm.loadProject(message.body.value).then(() => vm.greenFlag());
				break;
		}
	});

	document.getElementById('green-flag-button').onclick = () => vm.greenFlag();
	document.getElementById('stop-button').onclick = () => vm.stopAll();

	vscode.postMessage({type: "ready"}); // tell vscode that we're ready
})();
