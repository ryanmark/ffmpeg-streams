  return __ffmpegjs_return;
}

var __ffmpegjs_running = false;

var __bufSize = 1024;

var __dataIndex = 0;
var __data = [];

self.onmessage = function(e) {
  function makeOutLineHandler(cb) {
    var buf = [];
    return function(ch, exit) {
      if (exit && buf.length) return cb(__ffmpegjs_utf8ToStr(buf, 0));
      if (ch === 10 || ch === 13) {
        cb(__ffmpegjs_utf8ToStr(buf, 0));
        buf = [];
      } else if (ch !== 0) {
        // See <https://github.com/kripken/emscripten/blob/1.34.4/
        // src/library_tty.js#L146>.
        buf.push(ch);
      }
    };
  }

  function makeOutBinaryHandler(cb) {
    var buf = new Uint8Array(__bufSize);
    var bufIndex = 0;
    return function(byte, exit) {
      if (exit) {
        if (bufIndex) {
          cb(new Unit8Aray(buf, 0, bufIndex));
        }
      } else if (bufIndex === buf.length - 1) {
        buf[bufIndex] = byte;
        cb(buf);

        bufIndex = 0;
        buf = new Unit8Array(__bufSize);
      } else {
        buf[bufIndex] = byte;
        ++bufIndex;
      }
    };
  }

  var msg = e.data;

  if (msg["type"] == "run") {
    if (__ffmpegjs_running) {
      self.postMessage({"type": "error", "data": "already running"});
    } else {
      __ffmpegjs_running = true;
      self.postMessage({"type": "run"});
      var opts = {};
      Object.keys(msg).forEach(function(key) {
        if (key !== "type") {
          opts[key] = msg[key]
        }
      });
      opts["stdin"] = function() {
        if (__data.length === 0) {
          return undefined;
        } else {
          var current = __data[0];

          if (__dataIndex < current.length) {
            return current[__dataIndex++];
          } else {
            __data.shift();
            __dataIndex = 0;
            return undefined;
          }
        }
      };
      opts["stdout"] = makeOutBinaryHandler(function(data) {
        try {
          self.postMessage({"type": "stdout", "data": data}, [data.buffer]);
        } catch(e) {
          console.log(e);
        }
      });
      opts["stderr"] = makeOutLineHandler(function(data) {
        self.postMessage({"type": "stderr", "data": data});
      });
      opts["onExit"] = function(code) {
        // Flush buffers.
        opts["stdout"](0, true);
        opts["stderr"](0, true);
        self.postMessage({"type": "exit", "data": code});
      };
      // TODO(Kagami): Should we wrap this function into try/catch in
      // case of possible exception?
      var result = __ffmpegjs(opts);
      //var transfer = result["MEMFS"].map(function(file) {
      //return file["data"].buffer;
      //});
      //self.postMessage({"type": "done", "data": result}, transfer);
      //__ffmpegjs_running = false;
    }
  } else if (msg["type"] === 'stdin') {
    __data.push(new Uint8Array((new FileReaderSync).readAsArrayBuffer(msg["data"])));
  } else {
    self.postMessage({"type": "error", "data": "unknown command"});
  }
};

self.postMessage({"type": "ready"});
