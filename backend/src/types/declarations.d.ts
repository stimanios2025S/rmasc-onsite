declare module 'compression' {
  import { RequestHandler } from 'express';
  function compression(): RequestHandler;
  export default compression;
}

declare module 'express-rate-limit' {
  import { RequestHandler, Request } from 'express';
  interface Options {
    windowMs?: number;
    max?: number;
    message?: any;
    keyGenerator?: (req: any) => string;
    standardHeaders?: boolean;
    legacyHeaders?: boolean;
    skip?: (req: any) => boolean;
  }
  function rateLimit(options?: Options): RequestHandler;
  export default rateLimit;
}

declare module 'multer' {
  import { RequestHandler } from 'express';
  function multer(options?: any): {
    single(fieldName: string): RequestHandler;
    array(fieldName: string, maxCount?: number): RequestHandler;
  };
  namespace multer {
    function diskStorage(options: any): any;
  }
  export default multer;
}
