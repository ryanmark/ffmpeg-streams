var drain = false;
// need to be setup in start event
var stdinQueues;
var stdinIndices;

self.onmessage = function (event) {
  var type = event.data.type;

  switch(type) {
  case 'stdin':  receiveStdin(event.data); break;
  case 'start':  start(event.data);        break;
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


var noop = function () {};
var onNextInput = noop;

var __setTimeout = self.setTimeout;

var lastTime;
self.setTimeout = function (fn, delay) {
  lastTime = Date.now();
  console.log('waiting');
  onNextInput = fn;
};

function receiveStdin(event) {
  var queueId = event.pipe || 0;
  var queue = stdinQueues[queueId];
  var data = event.data;

  var buffer = (
    data instanceof ArrayBuffer ? new Uint8Array(data) :
    data instanceof Blob ? new Uint8Array((new FileReaderSync()).readAsArrayBuffer(data)) :
    data
  );
  queue.push(buffer);

  var hasMoreInput = dropInput(queueId);

  if (drain || hasMoreInput) {
    console.log('waited for ' + (Date.now() - lastTime) + 'ms, index: ' + stdinIndices[queueId]);
    __setTimeout(onNextInput, 0);
    onNextInput = noop;
  }
}

function finish() {
  drain = true;

  __setTimeout(onNextInput, 0);
  onNextInput = noop;
}

function dropInput(queueId) {
  var queue = stdinQueues[queueId];
  var index = stdinIndices[queueId];

  while(queue.length > 0 && queue.length === index) {
    queue.shift();
    stdinIndices[queueId] = 0;
    index = 0;
  }

  return queue.length > 0;
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

function start(event) {
  drain = false;
  var inputCount = event.inputCount || 1;
  stdinIndices = new Uint32Array(inputCount);
  stdinQueues = new Array(inputCount).fill(1).map(function () { return []; });

  var Module = {
    "arguments": event.arguments,
    "stdout": stdoutHandler,
    "stderr": stderrHandler,
  };
