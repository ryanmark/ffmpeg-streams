
self.onmessage = function (event) {
  var type = event.data.type;
  var data = event.data.data;

  switch(type) {
  case 'stdin': receiveStdin(data); break;
  case 'run':   start(data);        break;
  case 'finish': finish();          break;
  default: console.log('unknown message type: ', type);
  }
};

self.onerror = function(error) {
  console.log(error);
  flushStdout();

  self.postMessage({
    "type": "exit",
    "data": error.status
  });
};

var drain = false;
var stdinQueue = [];
var stdinIndex = 0;

var __setTimeout = setTimeout;

var noop = function () {};
var onNextInput = noop;

setTimeout = function (fn, delay) {
  if (drain || stdinQueue.length > 0) {
    return __setTimeout(fn, 0);
  } else {
    onNextInput = fn;
    return 1;
  }
};

function receiveStdin (blob) {
  stdinQueue.push(new Uint8Array((new FileReaderSync()).readAsArrayBuffer(blob)));

  __setTimeout(onNextInput, 0);
  onNextInput = noop;
}

function finish() {
  drain = true;
  // Put EOF on the input
  stdinQueue.push(new Int8Array([-1]));

  __setTimeout(onNextInput, 0);
  onNextInput = noop;
}

function stdinHandler() {
  if (stdinQueue.length === 0) {
    return null;
  } else {
    var current = stdinQueue[0];

    if (stdinIndex < current.length) {
      return current[stdinIndex++];
    } else {
      stdinQueue.shift();
      stdinIndex = 0;
      return stdinHandler();
    }
  }
};

var stdoutSize = 1024;
var stdoutBuffer = new Uint8Array(stdoutSize);
var stdoutIndex = 0;

function flushStdout() {
  try {
    if (stdoutIndex < stdoutSize) {
      // pass a smaller view
      stdoutBuffer = new Uint8Array(stdoutBuffer.buffer, 0, stdoutIndex);
    }

    self.postMessage({ "type": "stdout", "data": stdoutBuffer }, [stdoutBuffer.buffer]);
  } catch(e) {
    console.error('flush error');
    console.error(e);
  }
}

function stdoutHandler(byte) {
  stdoutBuffer[stdoutIndex] = byte;
  ++stdoutIndex;

  if (stdoutIndex === stdoutSize) {
    flushStdout();
    stdoutBuffer = new Uint8Array(stdoutSize);
    stdoutIndex = 0;
  }
}

function start(args) {
  var Module = {
    "arguments": args,
    "stdin": stdinHandler,
    "stdout": stdoutHandler,
    "printErr": function (str) { self.postMessage({ "type": "stderr", "data": str }); },
  };
