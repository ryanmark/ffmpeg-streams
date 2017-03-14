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
  flushStderr();

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

  __setTimeout(onNextInput, 0);
  onNextInput = noop;
}

function dropInput() {
  while(stdinQueue.length > 0 && stdinQueue[0].length === stdinIndex) {
    stdinQueue.shift();
    stdinIndex = 0;
  }
}

function stdinHandler() {
  // skip empty buffers
  dropInput();

  var value;

  if (stdinQueue.length === 0) {
    value = null;
  } else {
    value = stdinQueue[0][stdinIndex];
    ++stdinIndex;
  }

  dropInput();

  return value;
}

var stdoutSize = 16384;
var stdoutBuffer = new Uint8Array(stdoutSize);
var stdoutIndex = 0;

function flushStdout() {
  try {
    var out;

    if (stdoutIndex < stdoutSize) {
      // pass a smaller view
      out = new Uint8Array(stdoutBuffer.buffer, 0, stdoutIndex);
    } else {
      out = stdoutBuffer;
    }

    stdoutIndex = 0;

    self.postMessage({ "type": "stdout", "data": out });
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
  }
}

var stderrSize = 512;
var stderrBuffer = new Int8Array(stderrSize);
var stderrIndex = 0;

function flushStderr() {
  var str = String.fromCharCode.apply(String, new Int8Array(stderrBuffer.buffer, 0, stderrIndex));
  stderrIndex = 0;
  self.postMessage({ "type": "stderr", "data": str });
}

function stderrHandler(byte) {
  if (byte === 10 || byte === 13) {
    flushStderr();
    return;
  }

  stderrBuffer[stderrIndex] = byte;
  ++stderrIndex;

  if (stderrIndex === stderrSize) {
    flushStderr();
  }
}

function start(args) {
  var Module = {
    "arguments": args,
    "stdin": stdinHandler,
    "stdout": stdoutHandler,
    "stderr": stderrHandler,
  };
