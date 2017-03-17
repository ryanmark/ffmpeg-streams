mergeInto(LibraryManager.library, {
  js_is_queue_empty: function(queueId) {
    if (dropInput(queueId)) return 0;
    if (drain) return 0;
    return 1;
  },
  js_read_from_queue: function(queueId, ptr, count) {
    var queue = stdinQueues[queueId];
    var index = stdinIndices[queueId];

    if (queue.length === 0) {
      return 0;
    }

    var top = queue[0];

    if (count >= top.length) {
      // read all
      HEAPU8.set(top, ptr);
      queue.shift();
      return top.length;
    } else {
      // read only part
      HEAPU8.set(top.subarray(0, count), ptr);
      queue[0] = top.subarray(count);
      return count;
    }
  },
});
