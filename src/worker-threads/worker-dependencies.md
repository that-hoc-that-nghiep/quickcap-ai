# Worker Thread Dependencies

The `worker.js` script requires the following npm packages to be installed in the main application:

```bash
npm install @aws-sdk/client-s3 ffmpeg-static fluent-ffmpeg @tensorflow/tfjs-node nsfwjs jpeg-js
```

These packages must be installed along with the main application dependencies.

## Dependencies List

- `@aws-sdk/client-s3`: For S3 operations
- `ffmpeg-static`: For providing the FFmpeg binary
- `fluent-ffmpeg`: For video operations
- `@tensorflow/tfjs-node`: TensorFlow.js nodejs implementation
- `nsfwjs`: NSFW content detection model
- `jpeg-js`: For image processing
