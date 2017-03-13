self.onmessage = function (event) {
  var type = event.data.type;
  var data = event.data.data;

  switch(type) {
  case 'stdin':  receiveStdin(data); break;
  case 'run':    start(data);        break;
  case 'finish': finish();           break;
  default:
    self.postMessage({ type: 'error', data: 'unknown message type: ' + type });
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

var noop = function () {};
var onNextInput = noop;

var __setTimeout = self.setTimeout;

self.setTimeout = function (fn, delay) {
  onNextInput = fn;
};

function receiveStdin (data) {
  var buffer = (
    data instanceof ArrayBuffer ? new Uint8Array(data) :
    data instanceof Blob ? new Uint8Array((new FileReaderSync()).readAsArrayBuffer(data)) :
    data
  );

  stdinQueue.push(buffer);

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
      // TODO send the data back to avoid allocation
      // self.postMessage({
      //   type: 'usedBuffer',
      //   data: current
      // }, data.buffer);

      stdinQueue.shift();
      stdinIndex = 0;
      return stdinHandler();
    }
  }
};

var stdoutSize = 16384;
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
