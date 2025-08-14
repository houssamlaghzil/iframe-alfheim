import multer from 'multer';

const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, cb) => {
        const name = (file.originalname || '').toLowerCase();
        const okExt = name.endsWith('.glb');
        const okMime =
            file.mimetype === 'model/gltf-binary' ||
            file.mimetype === 'application/octet-stream' ||
            file.mimetype === '';
        if (okExt || okMime) return cb(null, true);
        cb(new Error('Invalid file type: GLB only'));
    },
    limits: { fileSize: 1024 * 1024 * 1024 }, // 1 Go
});

export default upload;
