self.onmessage = function (event) {
  var type = event.data.type;
  var data = event.data.data;

  switch(type) {
  case 'stdin': receiveStdin(data); break;
  case 'run':   start(data);        break;
  default: console.log('unknown message type: ', type);
  }
};

var stdinQueue = [];
var stdinIndex = 0;

function receiveStdin (blob) {
  stdinQueue.push(new Uint8Array((new FileReaderSync).readAsArrayBuffer(blob)));
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
      return null;
    }
  }
};

var stdoutSize = 1024;
var stdoutBuffer = new Uint8Array(stdoutSize);
var stdoutIndex = 0;

var lastByte = null;

self.onerror = function(error) {
  flushStdout();

  self.postMessage({
    "type": "exit",
    "data": error.status
  });
};

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
    "noExitRuntime": true,
    "stdin": stdinHandler,
    "stdout": stdoutHandler,
    "printErr": function (str) { self.postMessage({ "type": "stderr", "data": str }); },
  };
