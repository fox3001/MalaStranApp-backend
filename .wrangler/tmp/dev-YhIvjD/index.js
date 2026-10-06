var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-5Kj3Ce/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = /* @__PURE__ */ __name((arrayBuffer, contentType) => {
  return new Response(arrayBuffer, { headers: { "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase()) } }).formData();
}, "bufferToFormData");

// node_modules/hono/dist/utils/body.js
var MAX_NESTED_OBJECTS = 1e4;
var isRawRequest = /* @__PURE__ */ __name((request) => "headers" in request, "isRawRequest");
var parseBody = /* @__PURE__ */ __name(async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const mediaType = (isRawRequest(request) ? request.headers : request.raw.headers).get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") return parseFormData(request, {
    all,
    dot
  });
  return {};
}, "parseBody");
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) return convertFormDataToBodyData(await request.bodyCache.formData, options);
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) request.bodyCache.formData = formDataPromise;
  const formData = await formDataPromise;
  if (formData) return convertFormDataToBodyData(formData, options);
  return {};
}
__name(parseFormData, "parseFormData");
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  const nestingState = { count: 0 };
  formData.forEach((value, key) => {
    if (!(options.all || key.endsWith("[]"))) form[key] = value;
    else handleParsingAllValues(form, key, value);
  });
  if (options.dot) Object.entries(form).forEach(([key, value]) => {
    if (key.includes(".")) {
      handleParsingNestedValues(form, key, value, nestingState);
      delete form[key];
    }
  });
  return form;
}
__name(convertFormDataToBodyData, "convertFormDataToBodyData");
var handleParsingAllValues = /* @__PURE__ */ __name((form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) form[key].push(value);
    else form[key] = [form[key], value];
  } else if (!key.endsWith("[]")) form[key] = value;
  else form[key] = [value];
}, "handleParsingAllValues");
var handleParsingNestedValues = /* @__PURE__ */ __name((form, key, value, state) => {
  if (/(?:^|\.)__proto__\./.test(key)) return;
  let nestedForm = form;
  const keys = key.split(".", 34);
  if (keys.length > 33) throwNestingLimitExceeded();
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) nestedForm[key2] = value;
    else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        if (state.count++ >= MAX_NESTED_OBJECTS) throwNestingLimitExceeded();
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
}, "handleParsingNestedValues");
var throwNestingLimitExceeded = /* @__PURE__ */ __name(() => {
  throw new Error("Nesting limit exceeded");
}, "throwNestingLimitExceeded");

// node_modules/hono/dist/utils/url.js
var splitPath = /* @__PURE__ */ __name((path) => {
  const paths = path.split("/");
  if (paths[0] === "") paths.shift();
  return paths;
}, "splitPath");
var splitRoutingPath = /* @__PURE__ */ __name((routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
}, "splitRoutingPath");
var extractGroupsFromPath = /* @__PURE__ */ __name((path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return {
    groups,
    path
  };
}, "extractGroupsFromPath");
var replaceGroupMarks = /* @__PURE__ */ __name((paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) if (paths[j].includes(mark)) {
      paths[j] = paths[j].replace(mark, groups[i][1]);
      break;
    }
  }
  return paths;
}, "replaceGroupMarks");
var patternCache = {};
var getPattern = /* @__PURE__ */ __name((label, next) => {
  if (label === "*") return "*";
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [
        cacheKey,
        match2[1],
        new RegExp(`^${match2[2]}(?=/${next})`)
      ] : [
        label,
        match2[1],
        new RegExp(`^${match2[2]}$`)
      ];
      else patternCache[cacheKey] = [
        label,
        match2[1],
        true
      ];
    }
    return patternCache[cacheKey];
  }
  return null;
}, "getPattern");
var tryDecode = /* @__PURE__ */ __name((str2, decoder) => {
  try {
    return decoder(str2);
  } catch {
    return str2.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
}, "tryDecode");
var tryDecodeURI = /* @__PURE__ */ __name((str2) => tryDecode(str2, decodeURI), "tryDecodeURI");
var getPath = /* @__PURE__ */ __name((request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) break;
  }
  return url.slice(start, i);
}, "getPath");
var getPathNoStrict = /* @__PURE__ */ __name((request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
}, "getPathNoStrict");
var mergePath = /* @__PURE__ */ __name((base, sub, ...rest) => {
  if (rest.length) sub = mergePath(sub, ...rest);
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
}, "mergePath");
var checkOptionalParameter = /* @__PURE__ */ __name((path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) return null;
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) basePath += "/" + segment;
    else if (/\:/.test(segment)) {
      if (segment.charCodeAt(segment.length - 1) === 63) {
        if (results.length === 0 && basePath === "") results.push("/");
        else results.push(basePath);
        const optionalSegment = segment.slice(0, -1);
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else basePath += "/" + segment;
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
}, "checkOptionalParameter");
var tryDecodeURIComponent = /* @__PURE__ */ __name((str2) => str2.indexOf("%") !== -1 ? tryDecode(str2, decodeURIComponent_) : str2, "tryDecodeURIComponent");
var _decodeURI = /* @__PURE__ */ __name((value) => {
  if (value.indexOf("+") !== -1) value = value.replace(/\+/g, " ");
  return tryDecodeURIComponent(value);
}, "_decodeURI");
var _getQueryParam = /* @__PURE__ */ __name((url, key, multiple) => {
  const hashIndex = url.indexOf("#", 8);
  if (hashIndex !== -1) url = url.slice(0, hashIndex);
  let encoded;
  if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) return;
    if (!url.startsWith(key, keyIndex2 + 1)) keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) return "";
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) return;
  }
  const results = /* @__PURE__ */ Object.create(null);
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) valueIndex = -1;
    let name = url.slice(keyIndex + 1, valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex);
    if (encoded) name = _decodeURI(name);
    keyIndex = nextKeyIndex;
    if (name === "") continue;
    let value;
    if (valueIndex === -1) value = "";
    else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) value = _decodeURI(value);
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) results[name] = [];
      results[name].push(value);
    } else results[name] ??= value;
  }
  return key ? results[key] : results;
}, "_getQueryParam");
var getQueryParam = _getQueryParam;
var getQueryParams = /* @__PURE__ */ __name((url, key) => {
  return _getQueryParam(url, key, true);
}, "getQueryParams");
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var HonoRequest = class {
  static {
    __name(this, "HonoRequest");
  }
  /**
  * `.raw` can get the raw Request object.
  *
  * @see {@link https://hono.dev/docs/api/request#raw}
  *
  * @example
  * ```ts
  * // For Cloudflare Workers
  * app.post('/', async (c) => {
  *   const metadata = c.req.raw.cf?.hostMetadata?
  *   ...
  * })
  * ```
  */
  raw;
  #validatedData;
  #matchResult;
  routeIndex = 0;
  /**
  * `.path` can get the pathname of the request.
  *
  * @see {@link https://hono.dev/docs/api/request#path}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const pathname = c.req.path // `/about/me`
  * })
  * ```
  */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
    const param = this.#getParamValue(paramKey);
    return param && tryDecodeURIComponent(param);
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) decoded[key] = tryDecodeURIComponent(value);
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) return this.raw.headers.get(name) ?? void 0;
    const headerData = /* @__PURE__ */ Object.create(null);
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = /* @__PURE__ */ __name((key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) return cachedBody;
    for (const anyCachedKey in bodyCache) return bodyCache[anyCachedKey].then((body2) => {
      if (anyCachedKey === "json") body2 = JSON.stringify(body2);
      const contentType = anyCachedKey === "formData" ? void 0 : raw2.headers.get("content-type");
      return new Response(body2, { headers: contentType ? { "Content-Type": contentType } : void 0 })[key]();
    });
    return bodyCache[key] = raw2[key]();
  }, "#cachedBody");
  /**
  * `.json()` can parse Request body of type `application/json`
  *
  * @see {@link https://hono.dev/docs/api/request#json}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.json()
  * })
  * ```
  */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
  * `.text()` can parse Request body of type `text/plain`
  *
  * @see {@link https://hono.dev/docs/api/request#text}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.text()
  * })
  * ```
  */
  text() {
    return this.#cachedBody("text");
  }
  /**
  * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
  *
  * @see {@link https://hono.dev/docs/api/request#arraybuffer}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.arrayBuffer()
  * })
  * ```
  */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
  * `.bytes()` parses the request body as a `Uint8Array`.
  *
  * @see {@link https://hono.dev/docs/api/request#bytes}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.bytes()
  * })
  * ```
  */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
  * Parses the request body as a `Blob`.
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.blob();
  * });
  * ```
  * @see https://hono.dev/docs/api/request#blob
  */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
  * Parses the request body as `FormData`.
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.formData();
  * });
  * ```
  * @see https://hono.dev/docs/api/request#formdata
  */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
  * Adds validated data to the request.
  *
  * @param target - The target of the validation.
  * @param data - The validated data to add.
  */
  addValidatedData(target, data) {
    (this.#validatedData ??= {})[target] = data;
  }
  valid(target) {
    return this.#validatedData?.[target];
  }
  /**
  * `.url` can get the request url strings.
  *
  * @see {@link https://hono.dev/docs/api/request#url}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const url = c.req.url // `http://localhost:8787/about/me`
  *   ...
  * })
  * ```
  */
  get url() {
    return this.raw.url;
  }
  /**
  * `.method` can get the method name of the request.
  *
  * @see {@link https://hono.dev/docs/api/request#method}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const method = c.req.method // `GET`
  * })
  * ```
  */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
  * `.matchedRoutes` can return a matched route in the handler
  *
  * @deprecated
  *
  * Use matchedRoutes helper defined in "hono/route" instead.
  *
  * @see {@link https://hono.dev/docs/api/request#matchedroutes}
  *
  * @example
  * ```ts
  * app.use('*', async function logger(c, next) {
  *   await next()
  *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
  *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
  *     console.log(
  *       method,
  *       ' ',
  *       path,
  *       ' '.repeat(Math.max(10 - path.length, 0)),
  *       name,
  *       i === c.req.routeIndex ? '<- respond from here' : ''
  *     )
  *   })
  * })
  * ```
  */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
  * `.routePath` can retrieve the path registered within the handler
  *
  * @deprecated
  *
  * Use routePath helper defined in "hono/route" instead.
  *
  * @see {@link https://hono.dev/docs/api/request#routepath}
  *
  * @example
  * ```ts
  * app.get('/posts/:id', (c) => {
  *   return c.json({ path: c.req.routePath })
  * })
  * ```
  */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = /* @__PURE__ */ __name((value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
}, "raw");
var resolveCallback = /* @__PURE__ */ __name(async (str2, phase, preserveCallbacks, context, buffer) => {
  if (typeof str2 === "object" && !(str2 instanceof String)) {
    if (!(str2 instanceof Promise)) str2 = str2.toString();
    if (str2 instanceof Promise) str2 = await str2;
  }
  const callbacks = str2.callbacks;
  if (!callbacks?.length) return Promise.resolve(str2);
  if (buffer) buffer[0] += str2;
  else buffer = [str2];
  const resStr = Promise.all(callbacks.map((c) => c({
    phase,
    buffer,
    context
  }))).then((res) => Promise.all(res.filter(Boolean).map((str3) => resolveCallback(str3, phase, false, context, buffer))).then(() => buffer[0]));
  if (preserveCallbacks) return raw(await resStr, callbacks);
  else return resStr;
}, "resolveCallback");

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = /* @__PURE__ */ __name((contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
}, "setDefaultContentType");
var createResponseInstance = /* @__PURE__ */ __name((body2, init) => new Response(body2, init), "createResponseInstance");
var Context = class {
  static {
    __name(this, "Context");
  }
  #rawRequest;
  #req;
  /**
  * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
  *
  * @see {@link https://hono.dev/docs/api/context#env}
  *
  * @example
  * ```ts
  * // Environment object for Cloudflare Workers
  * app.get('*', async c => {
  *   const counter = c.env.COUNTER
  * })
  * ```
  */
  env = {};
  #var;
  finalized = false;
  /**
  * `.error` can get the error object from the middleware if the Handler throws an error.
  *
  * @see {@link https://hono.dev/docs/api/context#error}
  *
  * @example
  * ```ts
  * app.use('*', async (c, next) => {
  *   await next()
  *   if (c.error) {
  *     // do something...
  *   }
  * })
  * ```
  */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
  * Creates an instance of the Context class.
  *
  * @param req - The Request object.
  * @param options - Optional configuration options for the context.
  */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
  * `.req` is the instance of {@link HonoRequest}.
  */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#event}
  * The FetchEvent associated with the current request.
  *
  * @throws Will throw an error if the context does not have a FetchEvent.
  */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) return this.#executionCtx;
    else throw Error("This context has no FetchEvent");
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#executionctx}
  * The ExecutionContext associated with the current request.
  *
  * @throws Will throw an error if the context does not have an ExecutionContext.
  */
  get executionCtx() {
    if (this.#executionCtx) return this.#executionCtx;
    else throw Error("This context has no ExecutionContext");
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#res}
  * The Response object for the current request.
  */
  get res() {
    return this.#res ||= createResponseInstance(null, { headers: this.#preparedHeaders ??= new Headers() });
  }
  /**
  * Sets the Response object for the current request.
  *
  * @param _res - The Response object to set.
  */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") continue;
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) _res.headers.append("set-cookie", cookie);
        } else _res.headers.set(k, v);
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
  * `.render()` can create a response within a layout.
  *
  * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
  *
  * @example
  * ```ts
  * app.get('/', (c) => {
  *   return c.render('Hello!')
  * })
  * ```
  */
  render = /* @__PURE__ */ __name((...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  }, "render");
  /**
  * Sets the layout for the response.
  *
  * @param layout - The layout to set.
  * @returns The layout function.
  */
  setLayout = /* @__PURE__ */ __name((layout) => this.#layout = layout, "setLayout");
  /**
  * Gets the current layout for the response.
  *
  * @returns The current layout function.
  */
  getLayout = /* @__PURE__ */ __name(() => this.#layout, "getLayout");
  /**
  * `.setRenderer()` can set the layout in the custom middleware.
  *
  * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
  *
  * @example
  * ```tsx
  * app.use('*', async (c, next) => {
  *   c.setRenderer((content) => {
  *     return c.html(
  *       <html>
  *         <body>
  *           <p>{content}</p>
  *         </body>
  *       </html>
  *     )
  *   })
  *   await next()
  * })
  * ```
  */
  setRenderer = /* @__PURE__ */ __name((renderer) => {
    this.#renderer = renderer;
  }, "setRenderer");
  /**
  * `.header()` can set headers.
  *
  * @see {@link https://hono.dev/docs/api/context#header}
  *
  * @example
  * ```ts
  * app.get('/welcome', (c) => {
  *   // Set headers
  *   c.header('X-Message', 'Hello!')
  *   c.header('Content-Type', 'text/plain')
  *
  *   // Append multiple headers using the append option (e.g. Vary)
  *   c.header('Vary', 'Accept-Encoding', { append: true })
  *   c.header('Vary', 'User-Agent', { append: true })
  *
  *   return c.body('Thank you for coming')
  * })
  * ```
  */
  header = /* @__PURE__ */ __name((name, value, options) => {
    if (this.finalized) this.#res = createResponseInstance(this.#res.body, this.#res);
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) headers.delete(name);
    else if (options?.append) headers.append(name, value);
    else headers.set(name, value);
  }, "header");
  status = /* @__PURE__ */ __name((status) => {
    this.#status = status;
  }, "status");
  /**
  * `.set()` can set the value specified by the key.
  *
  * @see {@link https://hono.dev/docs/api/context#set-get}
  *
  * @example
  * ```ts
  * app.use('*', async (c, next) => {
  *   c.set('message', 'Hono is hot!!')
  *   await next()
  * })
  * ```
  */
  set = /* @__PURE__ */ __name((key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  }, "set");
  /**
  * `.get()` can use the value specified by the key.
  *
  * @see {@link https://hono.dev/docs/api/context#set-get}
  *
  * @example
  * ```ts
  * app.get('/', (c) => {
  *   const message = c.get('message')
  *   return c.text(`The message is "${message}"`)
  * })
  * ```
  */
  get = /* @__PURE__ */ __name((key) => {
    return this.#var ? this.#var.get(key) : void 0;
  }, "get");
  /**
  * `.var` can access the value of a variable.
  *
  * @see {@link https://hono.dev/docs/api/context#var}
  *
  * @example
  * ```ts
  * const result = c.var.client.oneMethod()
  * ```
  */
  get var() {
    if (!this.#var) return {};
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
    if (typeof arg === "object" && arg.headers) {
      responseHeaders ??= new Headers();
      for (const [key, value] of new Headers(arg.headers)) if (key === "set-cookie") responseHeaders.append(key, value);
      else responseHeaders.set(key, value);
    }
    if (headers) {
      if (!responseHeaders) {
        let count = 0;
        for (const k in headers) if (++count > 1 || typeof headers[k] !== "string") {
          responseHeaders = new Headers();
          break;
        }
      }
      if (responseHeaders) for (const k in headers) {
        const v = headers[k];
        if (typeof v === "string") responseHeaders.set(k, v);
        else {
          responseHeaders.delete(k);
          for (const v2 of v) responseHeaders.append(k, v2);
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, {
      status,
      headers: responseHeaders ?? headers
    });
  }
  newResponse = /* @__PURE__ */ __name((...args) => this.#newResponse(...args), "newResponse");
  /**
  * `.body()` can return the HTTP response.
  * You can set headers with `.header()` and set HTTP status code with `.status`.
  * This can also be set in `.text()`, `.json()` and so on.
  *
  * @see {@link https://hono.dev/docs/api/context#body}
  *
  * @example
  * ```ts
  * app.get('/welcome', (c) => {
  *   // Set headers
  *   c.header('X-Message', 'Hello!')
  *   c.header('Content-Type', 'text/plain')
  *   // Set HTTP status code
  *   c.status(201)
  *
  *   // Return the response body
  *   return c.body('Thank you for coming')
  * })
  * ```
  */
  body = /* @__PURE__ */ __name((data, arg, headers) => this.#newResponse(data, arg, headers), "body");
  /**
  * `.text()` can render text as `Content-Type:text/plain`.
  *
  * @see {@link https://hono.dev/docs/api/context#text}
  *
  * @example
  * ```ts
  * app.get('/say', (c) => {
  *   return c.text('Hello!')
  * })
  * ```
  */
  text = /* @__PURE__ */ __name((text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(text, arg, setDefaultContentType(TEXT_PLAIN, headers));
  }, "text");
  /**
  * `.json()` can render JSON as `Content-Type:application/json`.
  *
  * @see {@link https://hono.dev/docs/api/context#json}
  *
  * @example
  * ```ts
  * app.get('/api', (c) => {
  *   return c.json({ message: 'Hello!' })
  * })
  * ```
  */
  json = /* @__PURE__ */ __name((object, arg, headers) => {
    return this.#newResponse(JSON.stringify(object), arg, setDefaultContentType("application/json", headers));
  }, "json");
  html = /* @__PURE__ */ __name((html, arg, headers) => {
    const res = /* @__PURE__ */ __name((html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers)), "res");
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  }, "html");
  /**
  * `.redirect()` can Redirect, default status code is 302.
  *
  * @see {@link https://hono.dev/docs/api/context#redirect}
  *
  * @example
  * ```ts
  * app.get('/redirect', (c) => {
  *   return c.redirect('/')
  * })
  * app.get('/redirect-permanently', (c) => {
  *   return c.redirect('/', 301)
  * })
  * ```
  */
  redirect = /* @__PURE__ */ __name((location, status) => {
    const locationString = String(location);
    this.header("Location", !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString));
    return this.newResponse(null, status ?? 302);
  }, "redirect");
  /**
  * `.notFound()` can return the Not Found Response.
  *
  * @see {@link https://hono.dev/docs/api/context#notfound}
  *
  * @example
  * ```ts
  * app.get('/notfound', (c) => {
  *   return c.notFound()
  * })
  * ```
  */
  notFound = /* @__PURE__ */ __name(() => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  }, "notFound");
};

// node_modules/hono/dist/compose.js
var compose = /* @__PURE__ */ __name((middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) throw new Error("next() called multiple times");
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else handler = i === middleware.length && next || void 0;
      if (handler) try {
        res = await handler(context, () => dispatch(i + 1));
      } catch (err) {
        if (err instanceof Error && onError) {
          context.error = err;
          res = await onError(err, context);
          isError = true;
        } else throw err;
      }
      else if (context.finalized === false && onNotFound) res = await onNotFound(context);
      if (res && (context.finalized === false || isError)) context.res = res;
      return context;
    }
    __name(dispatch, "dispatch");
  };
}, "compose");

// node_modules/hono/dist/router.js
var METHODS = [
  "get",
  "post",
  "put",
  "delete",
  "options",
  "patch",
  "query"
];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
  static {
    __name(this, "UnsupportedPathError");
  }
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = /* @__PURE__ */ __name((c) => {
  return c.text("404 Not Found", 404);
}, "notFoundHandler");
var errorHandler = /* @__PURE__ */ __name((err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
}, "errorHandler");
var Hono = class Hono2 {
  static {
    __name(this, "Hono");
  }
  get;
  post;
  put;
  delete;
  options;
  patch;
  query;
  all;
  on;
  use;
  router;
  getPath;
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    [...METHODS, "all"].forEach((method) => {
      this[method] = (args1, ...args) => {
        const methodName = method.toUpperCase();
        if (typeof args1 === "string") this.#path = args1;
        else this.#addRoute(methodName, this.#path, args1);
        args.forEach((handler) => {
          this.#addRoute(methodName, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          const methodName = m.toUpperCase();
          for (const handler of handlers) this.#addRoute(methodName, this.#path, handler);
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") this.#path = arg1;
      else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute("ALL", this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new Hono2({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  errorHandler = errorHandler;
  /**
  * `.route()` allows grouping other Hono instance in routes.
  *
  * @see {@link https://hono.dev/docs/api/routing#grouping}
  *
  * @param {string} path - base Path
  * @param {Hono} app - other Hono instance
  * @returns {Hono} routed Hono instance
  *
  * @example
  * ```ts
  * const app = new Hono()
  * const app2 = new Hono()
  *
  * app2.get("/user", (c) => c.text("user"))
  * app.route("/api", app2) // GET /api/user
  * ```
  */
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler;
      if (app2.errorHandler === errorHandler) handler = r.handler;
      else {
        handler = /* @__PURE__ */ __name(async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res, "handler");
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler, r.basePath);
    });
    return this;
  }
  /**
  * `.basePath()` allows base paths to be specified.
  *
  * @see {@link https://hono.dev/docs/api/routing#base-path}
  *
  * @param {string} path - base Path
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * const api = new Hono().basePath('/api')
  * ```
  */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
  * `.onError()` handles an error and returns a customized Response.
  *
  * @see {@link https://hono.dev/docs/api/hono#error-handling}
  *
  * @param {ErrorHandler} handler - request Handler for error
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * app.onError((err, c) => {
  *   console.error(`${err}`)
  *   return c.text('Custom Error Message', 500)
  * })
  * ```
  */
  onError = /* @__PURE__ */ __name((handler) => {
    this.errorHandler = handler;
    return this;
  }, "onError");
  /**
  * `.notFound()` allows you to customize a Not Found Response.
  *
  * @see {@link https://hono.dev/docs/api/hono#not-found}
  *
  * @param {NotFoundHandler} handler - request handler for not-found
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * app.notFound((c) => {
  *   return c.text('Custom 404 Message', 404)
  * })
  * ```
  */
  notFound = /* @__PURE__ */ __name((handler) => {
    this.#notFoundHandler = handler;
    return this;
  }, "notFound");
  /**
  * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
  *
  * @deprecated Use `mount()` from `hono/mount` instead. `.mount()` will be removed in v5.
  *
  * @see {@link https://hono.dev/docs/api/hono#mount}
  *
  * @param {string} path - base Path
  * @param {Function} applicationHandler - other Request Handler
  * @param {MountOptions} [options] - options of `.mount()`
  * @returns {Hono} mounted Hono instance
  *
  * @example
  * ```ts
  * import { Router as IttyRouter } from 'itty-router'
  * import { Hono } from 'hono'
  * // Create itty-router application
  * const ittyRouter = IttyRouter()
  * // GET /itty-router/hello
  * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
  *
  * const app = new Hono()
  * app.mount('/itty-router', ittyRouter.handle)
  * ```
  *
  * @example
  * ```ts
  * const app = new Hono()
  * // Send the request to another application without modification.
  * app.mount('/app', anotherApp, {
  *   replaceRequest: (req) => req,
  * })
  * ```
  */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") optionHandler = options;
      else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) replaceRequest = /* @__PURE__ */ __name((request) => request, "replaceRequest");
        else replaceRequest = options.replaceRequest;
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = /* @__PURE__ */ __name(async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) return res;
      await next();
    }, "handler");
    this.#addRoute("ALL", mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler, baseRoutePath) {
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) return this.errorHandler(err, c);
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then((resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) throw new Error("Context is not finalized. Did you forget to return a Response object or `await next()`?");
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
  * `.fetch()` will be entry point of your app.
  *
  * @see {@link https://hono.dev/docs/api/hono#fetch}
  *
  * @param {Request} request - request Object of request
  * @param {Env} env - env Object
  * @param {ExecutionContext} executionCtx - context of execution
  * @returns {Response | Promise<Response>} response of request
  *
  */
  fetch = /* @__PURE__ */ __name((request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  }, "fetch");
  /**
  * `.request()` is a useful method for testing.
  * You can pass a URL or pathname to send a GET request.
  * app will return a Response object.
  * ```ts
  * test('GET /hello is ok', async () => {
  *   const res = await app.request('/hello')
  *   expect(res.status).toBe(200)
  * })
  * ```
  * @see https://hono.dev/docs/api/hono#request
  */
  request = /* @__PURE__ */ __name((input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    input = input.toString();
    return this.fetch(new Request(/^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`, requestInit), Env, executionCtx);
  }, "request");
  /**
  * `.fire()` automatically adds a global fetch event listener.
  * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
  * @deprecated
  * Use `fire` from `hono/service-worker` instead.
  * ```ts
  * import { Hono } from 'hono'
  * import { fire } from 'hono/service-worker'
  *
  * const app = new Hono()
  * // ...
  * fire(app)
  * ```
  * @see https://hono.dev/docs/api/hono#fire
  * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
  * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
  */
  fire = /* @__PURE__ */ __name(() => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  }, "fire");
};

// node_modules/hono/dist/router/utils.js
var createNullObject = /* @__PURE__ */ __name(() => /* @__PURE__ */ Object.create(null), "createNullObject");

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = /* @__PURE__ */ __name(((method2, path2) => {
    const matcher = matchers[method2] || matchers["ALL"];
    const staticMatch = matcher[2][path2];
    if (staticMatch) return staticMatch;
    const match3 = path2.match(matcher[0]);
    if (!match3) return [[], emptyParam];
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  }), "match");
  this.match = match2;
  return match2(method, path);
}
__name(match, "match");

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = /* @__PURE__ */ new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) return b.length === 1 ? a < b ? -1 : 1 : -1;
  if (b.length === 1) return 1;
  if (a === ".*" || a === "(?:|/.*)") return b === "(?:|/.*)" ? -1 : 1;
  else if (b === ".*" || b === "(?:|/.*)") return -1;
  if (a === "[^/]+") return 1;
  else if (b === "[^/]+") return -1;
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
__name(compareKey, "compareKey");
var Node = class Node2 {
  static {
    __name(this, "Node");
  }
  #index;
  #varIndex;
  #children = createNullObject();
  insert(tokens, index, paramMap, context, isStatic) {
    let node = this;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? [
        "",
        "",
        ".*"
      ] : [
        "",
        "",
        LABEL_REG_EXP_STR
      ] : null : token === "/*" ? [
        "",
        "",
        TAIL_WILDCARD_REG_EXP_STR
      ] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
      let nextNode;
      if (pattern) {
        const name = pattern[1];
        let regexpStr = pattern[2] || "[^/]+";
        if (name && pattern[2]) {
          if (regexpStr === ".*") throw PATH_ERROR;
          regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
          if (/\((?!\?:)/.test(regexpStr)) throw PATH_ERROR;
          if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) throw PATH_ERROR;
        }
        nextNode = node.#children[regexpStr];
        if (!nextNode) {
          if (regexpStr !== ".*" && regexpStr !== "(?:|/.*)") {
            for (const k in node.#children) if ((regexpStr.length > 1 || k.length > 1) && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
          }
          nextNode = node.#children[regexpStr] = new Node2();
        }
        if (name !== "") {
          nextNode.#varIndex ??= context.varIndex++;
          paramMap.push([name, nextNode.#varIndex]);
        }
      } else {
        nextNode = node.#children[token];
        if (!nextNode) {
          for (const k in node.#children) if (k.length > 1 && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
          nextNode = node.#children[token] = new Node2();
        }
      }
      node = nextNode;
    }
    if (node.#index !== void 0) throw PATH_ERROR;
    node.#index = isStatic ? -1 : index;
  }
  buildRegExpStr() {
    const strList = Object.keys(this.#children).sort(compareKey).map((k) => {
      const c = this.#children[k];
      const childStr = c.buildRegExpStr();
      return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
    }).filter(Boolean);
    if (typeof this.#index === "number" && this.#index !== -1) strList.unshift(`#${this.#index}`);
    if (strList.length === 0) return "";
    if (strList.length === 1) return strList[0];
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  static {
    __name(this, "Trie");
  }
  #context = { varIndex: 0 };
  #root = new Node();
  #index = 0;
  paths = createNullObject();
  insert(path, isStatic) {
    if (isStatic) {
      this.#root.insert(path.split(""), 0, [], this.#context, true);
      return;
    }
    const paramAssoc = [];
    const groups = [];
    let markedPath = path;
    for (let i = 0; ; ) {
      let replaced = false;
      markedPath = markedPath.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) break;
    }
    const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) if (tokens[j].indexOf(mark) !== -1) {
        tokens[j] = tokens[j].replace(mark, groups[i][1]);
        break;
      }
    }
    this.#root.insert(tokens, this.#index, paramAssoc, this.#context, false);
    this.paths[path] = [this.#index++, paramAssoc];
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") return [
      /^$/,
      [],
      []
    ];
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [
      new RegExp(`^${regexp}`),
      indexReplacementMap,
      paramReplacementMap
    ];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var wildcardRegExpCache = createNullObject();
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(`^${path.replace(/\/:[^/{}]+(?:\{\[\^\/]\+})?(?=[/{]|$)|\/?\*$|([.\\+*[^\]$()?{}|])/g, (match2, metaChar) => metaChar ? `\\${metaChar}` : match2 === "/*" ? TAIL_WILDCARD_REG_EXP_STR : match2 === "*" ? ".*" : `/:${LABEL_REG_EXP_STR}`)}$`);
}
__name(buildWildcardRegExp, "buildWildcardRegExp");
function findMiddleware(middleware, path) {
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) if (buildWildcardRegExp(k).test(path)) return [...middleware[k]];
}
__name(findMiddleware, "findMiddleware");
var RegExpRouter = class {
  static {
    __name(this, "RegExpRouter");
  }
  name = "RegExpRouter";
  #middleware;
  #routes;
  #tries;
  constructor() {
    this.#middleware = { ["ALL"]: createNullObject() };
    this.#routes = { ["ALL"]: createNullObject() };
    this.#tries = { ["ALL"]: new Trie() };
  }
  #insertPath(method, path) {
    try {
      this.#tries[method].insert(path, !/\*|\/:/.test(path));
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    if (!middleware[method]) {
      this.#tries[method] = new Trie();
      for (const handlerMap of [middleware, routes]) {
        handlerMap[method] = createNullObject();
        for (const p in handlerMap["ALL"]) {
          handlerMap[method][p] = [...handlerMap["ALL"][p]];
          this.#insertPath(method, p);
        }
      }
    }
    if (path === "/*") path = "*";
    const methods = method === "ALL" ? Object.keys(middleware) : [method];
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      for (const m of methods) if (!middleware[m][path]) {
        this.#insertPath(m, path);
        middleware[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware["ALL"], path) || [];
      }
      for (const handlerMap of [middleware, routes]) for (const m of methods) for (const p in handlerMap[m]) re.test(p) && handlerMap[m][p].push([handler, path]);
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (const path2 of paths) for (const m of methods) {
      if (!routes[m][path2]) {
        this.#insertPath(m, path2);
        routes[m][path2] = findMiddleware(middleware[m], path2) || findMiddleware(middleware["ALL"], path2) || [];
      }
      routes[m][path2].push([handler, path2]);
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = createNullObject();
    for (const method of Object.keys(this.#routes)) matchers[method] = this.#buildMatcher(method);
    this.#middleware = this.#routes = this.#tries = void 0;
    wildcardRegExpCache = createNullObject();
    return matchers;
  }
  #buildMatcher(method) {
    const middleware = this.#middleware[method];
    const routes = this.#routes[method];
    const trie = this.#tries[method];
    const staticMap = createNullObject();
    const handlerData = [];
    const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
    for (const r of [middleware, routes]) for (const path in r) {
      const handlers = r[path];
      const pathData = trie.paths[path];
      if (!pathData) {
        staticMap[path] = [handlers.map(([h]) => [h, createNullObject()]), emptyParam];
        continue;
      }
      handlerData[pathData[0]] = handlers.map(([h, handlerPath]) => [h, trie.paths[handlerPath][1].reduceRight((map, [key], i) => {
        map[key] = paramReplacementMap[pathData[1][i][1]];
        return map;
      }, createNullObject())]);
    }
    return [
      regexp,
      indexReplacementMap.map((i) => handlerData[i]),
      staticMap
    ];
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  static {
    __name(this, "SmartRouter");
  }
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    this.#routes.push([
      method,
      path,
      handler
    ]);
  }
  match(method, path) {
    if (!this.#routes) throw new Error("Fatal error");
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) router.add(...routes[i2]);
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) continue;
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) throw new Error("Fatal error");
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) throw new Error("No active router has been determined yet.");
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = createNullObject();
var order = 0;
var Node3 = class Node4 {
  static {
    __name(this, "Node");
  }
  #methods = [];
  #children = createNullObject();
  #patterns = [];
  #pattern;
  #params = emptyParams;
  insert(method, path, handler) {
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = /* @__PURE__ */ new Set();
    let i = 0;
    for (const p of parts) {
      const nextP = parts[++i];
      const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
      const isParam = Array.isArray(pattern);
      const key = isParam ? pattern[0] : pattern || p;
      const child = curNode.#children[key] ||= new Node4();
      if (pattern && !child.#pattern) {
        child.#pattern = pattern;
        curNode.#patterns.push(child);
      }
      curNode = child;
      if (isParam) possibleKeys.add(pattern[1]);
    }
    curNode.#methods.push({ [method]: {
      handler,
      possibleKeys: [...possibleKeys],
      score: ++order
    } });
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m["ALL"];
      if (handlerSet) {
        handlerSet.params = createNullObject();
        handlerSets.push(handlerSet);
        for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
          const key = handlerSet.possibleKeys[i2];
          handlerSet.params[key] = params?.[key] && !i2 ? params[key] : nodeParams[key] ?? params?.[key];
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    let curNodes = [this];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else tempNodes.push(nextNode);
        }
        for (const child of node.#patterns) {
          const pattern = child.#pattern;
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (typeof pattern === "string") {
            if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
              this.#pushHandlerSets(handlerSets, child, method, node.#params);
              if (pattern === "*") {
                child.#params = params;
                tempNodes.push(child);
              }
            }
            continue;
          }
          const [, name, matcher] = pattern;
          if (!part && matcher === true) continue;
          if (matcher !== true) {
            if (!partOffsets) {
              partOffsets = [];
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.slice(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, node.#params, params);
              for (const _ in child.#children) {
                child.#params = params;
                const componentCount = m[0].match(/\//g)?.length ?? 0;
                (curNodesQueue[componentCount] ||= []).push(child);
                break;
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, params, node.#params);
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets[1]) handlerSets.sort((a, b) => {
      return a.score - b.score;
    });
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  static {
    __name(this, "TrieRouter");
  }
  name = "TrieRouter";
  #node = new Node3();
  add(method, path, handler) {
    for (const result of checkOptionalParameter(path) || [path]) this.#node.insert(method, result, handler);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono3 = class extends Hono {
  static {
    __name(this, "Hono");
  }
  /**
  * Creates an instance of the Hono class.
  *
  * @param options - Optional configuration options for the Hono instance.
  */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({ routers: [new RegExpRouter(), new TrieRouter()] });
  }
};

// node_modules/hono/dist/middleware/cors/index.js
var cors = /* @__PURE__ */ __name((options) => {
  const opts = {
    origin: "*",
    allowMethods: [
      "GET",
      "HEAD",
      "PUT",
      "POST",
      "DELETE",
      "PATCH",
      "QUERY"
    ],
    allowHeaders: [],
    exposeHeaders: [],
    ...options
  };
  const exposeHeadersStr = opts.exposeHeaders?.length ? opts.exposeHeaders.join(",") : void 0;
  const allowHeadersStr = opts.allowHeaders?.length ? opts.allowHeaders.join(",") : void 0;
  const findAllowOrigin = ((optsOrigin) => {
    if (typeof optsOrigin === "string") {
      if (optsOrigin === "*") return () => optsOrigin;
      else return (origin) => optsOrigin === origin ? origin : null;
    } else if (typeof optsOrigin === "function") return optsOrigin;
    else return (origin) => optsOrigin.includes(origin) ? origin : null;
  })(opts.origin);
  const findAllowMethods = ((optsAllowMethods) => {
    if (typeof optsAllowMethods === "function") return async (origin, c) => (await optsAllowMethods(origin, c)).join(",");
    else if (Array.isArray(optsAllowMethods)) {
      const methodsStr = optsAllowMethods.join(",");
      return () => methodsStr;
    } else return () => "";
  })(opts.allowMethods);
  return /* @__PURE__ */ __name(async function cors2(c, next) {
    function set(key, value) {
      c.res.headers.set(key, value);
    }
    __name(set, "set");
    const allowOrigin = await findAllowOrigin(c.req.header("origin") || "", c);
    if (allowOrigin) set("Access-Control-Allow-Origin", allowOrigin);
    if (opts.credentials) set("Access-Control-Allow-Credentials", "true");
    if (exposeHeadersStr) set("Access-Control-Expose-Headers", exposeHeadersStr);
    if (c.req.method === "OPTIONS") {
      if (opts.origin !== "*") c.res.headers.append("Vary", "Origin");
      if (opts.maxAge != null) set("Access-Control-Max-Age", opts.maxAge.toString());
      const allowMethods = await findAllowMethods(c.req.header("origin") || "", c);
      if (allowMethods) set("Access-Control-Allow-Methods", allowMethods);
      let headersStr = allowHeadersStr;
      if (!headersStr) {
        const requestHeaders = c.req.header("Access-Control-Request-Headers");
        if (requestHeaders) headersStr = requestHeaders.split(",").map((h) => h.trim()).join(",");
      }
      if (headersStr) {
        set("Access-Control-Allow-Headers", headersStr);
        c.res.headers.append("Vary", "Access-Control-Request-Headers");
      }
      c.res.headers.delete("Content-Length");
      c.res.headers.delete("Content-Type");
      return new Response(null, {
        headers: c.res.headers,
        status: 204,
        statusText: "No Content"
      });
    }
    await next();
    if (opts.origin !== "*") c.header("Vary", "Origin", { append: true });
  }, "cors");
}, "cors");

// src/schema.ts
var SCHEMA_VERSION = 4;
var TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cognome TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    password_hash TEXT NOT NULL,
    ruolo TEXT NOT NULL CHECK (ruolo IN ('admin', 'user')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    data TEXT NOT NULL,
    ora_ritrovo TEXT,
    ora_inizio TEXT,
    ora_fine TEXT,
    luogo TEXT,
    tipo TEXT,
    descrizione TEXT,
    info_operative TEXT,
    referente_nome TEXT,
    referente_telefono TEXT,
    compenso TEXT,
    compenso_visibile INTEGER NOT NULL DEFAULT 0,
    note_admin TEXT,
    stato TEXT NOT NULL DEFAULT 'richiesta' CHECK (stato IN ('richiesta', 'da_definire', 'confermato', 'annullato', 'chiuso')),
    motivo_annullamento TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_data ON events(data)`,
  `CREATE TABLE IF NOT EXISTS event_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stato TEXT NOT NULL DEFAULT 'pending' CHECK (stato IN ('pending', 'available', 'unavailable', 'confirmed', 'rejected')),
    ruolo_evento TEXT,
    nota_user TEXT,
    nota_admin TEXT,
    requested_at TEXT NOT NULL DEFAULT (datetime('now')),
    responded_at TEXT,
    decided_at TEXT,
    UNIQUE (event_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_participants_user ON event_participants(user_id)`,
  `CREATE TABLE IF NOT EXISTS load_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    item TEXT NOT NULL,
    categoria TEXT,
    quantita INTEGER NOT NULL DEFAULT 1,
    assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    present INTEGER NOT NULL DEFAULT 0,
    returned INTEGER NOT NULL DEFAULT 0,
    damaged INTEGER NOT NULL DEFAULT 0,
    comment TEXT,
    codice TEXT,
    taglia TEXT,
    updated_by TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_load_rows_event ON load_rows(event_id)`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    for_admin INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)`,
  `CREATE TABLE IF NOT EXISTS user_costumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    categoria TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_user_costumes_user ON user_costumes(user_id)`,
  `CREATE TABLE IF NOT EXISTS schema_info (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`
];
var USER_EXTRA_COLUMNS = [
  ["telefono", "TEXT"],
  ["bio", "TEXT"],
  ["note", "TEXT"],
  ["qualifica", "TEXT"],
  ["attivo", "INTEGER NOT NULL DEFAULT 1"],
  ["competenze_json", "TEXT NOT NULL DEFAULT '[]'"],
  ["competenze_flag_json", "TEXT NOT NULL DEFAULT '[]'"]
];
var REQUIRED_MARKER = {
  users: "username",
  events: "ora_ritrovo",
  sessions: "token_hash"
};
var LOAD_ROW_EXTRA_COLUMNS = [
  ["codice", "TEXT"],
  ["taglia", "TEXT"]
];
var OLD_TABLES = ["availability_requests", "assignments", "tl_assignments"];
async function tableNames(db) {
  const rows = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  return new Set(rows.results.map((r) => r.name));
}
__name(tableNames, "tableNames");
async function columnNames(db, table) {
  const rows = await db.prepare(`PRAGMA table_info(${table})`).all();
  return new Set(rows.results.map((r) => r.name));
}
__name(columnNames, "columnNames");
var ready = null;
function ensureSchema(db) {
  if (!ready) {
    ready = migrate(db).catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}
__name(ensureSchema, "ensureSchema");
async function migrate(db) {
  let tables = await tableNames(db);
  if (tables.has("schema_info")) {
    const row = await db.prepare("SELECT version FROM schema_info WHERE id = 1").first();
    if (row && row.version >= SCHEMA_VERSION) return;
  }
  const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
  for (const [table, marker] of Object.entries(REQUIRED_MARKER)) {
    if (tables.has(table) && !(await columnNames(db, table)).has(marker)) {
      const count = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first();
      if (count && count.n === 0 && table === "events") {
        await db.prepare("DROP TABLE IF EXISTS event_participants").run();
        await db.prepare("DROP TABLE IF EXISTS load_rows").run();
        await db.prepare("UPDATE notifications SET event_id = NULL WHERE event_id IS NOT NULL").run().catch(() => void 0);
        await db.prepare("DROP TABLE events").run();
      } else {
        await db.prepare(`ALTER TABLE ${table} RENAME TO legacy_${table}_${stamp}`).run();
      }
    }
  }
  for (const table of OLD_TABLES) {
    if (tables.has(table)) await db.prepare(`ALTER TABLE ${table} RENAME TO legacy_${table}_${stamp}`).run();
  }
  for (const sql of TABLES) await db.prepare(sql).run();
  const userCols = await columnNames(db, "users");
  for (const [name, def] of USER_EXTRA_COLUMNS) {
    if (!userCols.has(name)) await db.prepare(`ALTER TABLE users ADD COLUMN ${name} ${def}`).run();
  }
  const loadCols = await columnNames(db, "load_rows");
  for (const [name, def] of LOAD_ROW_EXTRA_COLUMNS) {
    if (!loadCols.has(name)) await db.prepare(`ALTER TABLE load_rows ADD COLUMN ${name} ${def}`).run();
  }
  await db.prepare("INSERT INTO schema_info (id, version, updated_at) VALUES (1, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at").bind(SCHEMA_VERSION).run();
  tables = await tableNames(db);
}
__name(migrate, "migrate");
async function schemaStatus(db) {
  const tables = [...await tableNames(db)].filter((t) => !t.startsWith("_cf") && t !== "sqlite_sequence").sort();
  const row = tables.includes("schema_info") ? await db.prepare("SELECT version FROM schema_info WHERE id = 1").first() : null;
  return { version: row?.version ?? 0, tables };
}
__name(schemaStatus, "schemaStatus");

// src/index.ts
var app = new Hono3();
var encoder = new TextEncoder();
function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
__name(bytesToHex, "bytesToHex");
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
__name(hexToBytes, "hexToBytes");
function normalizePart(value) {
  return value.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}
__name(normalizePart, "normalizePart");
function str(value, max = 2e3) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v.slice(0, max) : null;
}
__name(str, "str");
function bool(value) {
  return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
}
__name(bool, "bool");
function tagList(value) {
  if (!Array.isArray(value)) return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const t = v.trim().slice(0, 40);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= 60) break;
  }
  return out;
}
__name(tagList, "tagList");
function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(typeof value === "string" ? value : "[]");
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}
__name(parseJsonArray, "parseJsonArray");
function fail(c, status, error) {
  return c.json({ success: false, error }, status);
}
__name(fail, "fail");
async function body(c) {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}
__name(body, "body");
function intParam(c, name) {
  const n = Number(c.req.param(name));
  return Number.isInteger(n) && n > 0 ? n : null;
}
__name(intParam, "intParam");
var PBKDF2_ITERATIONS = 1e5;
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, stored) {
  const [scheme, iterText, saltHex, hashHex] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterText || !saltHex || !hashHex) return false;
  const iterations = Number(iterText);
  if (!Number.isInteger(iterations) || iterations < 1e4 || iterations > 1e5) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations }, key, 256));
  const expected = hexToBytes(hashHex);
  if (bits.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i += 1) diff |= (bits[i] ?? 0) ^ (expected[i] ?? 0);
  return diff === 0;
}
__name(verifyPassword, "verifyPassword");
async function hashToken(token) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token))));
}
__name(hashToken, "hashToken");
var SESSION_DAYS = 30;
async function createSession(db, user) {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await db.prepare("INSERT INTO sessions (id, user_id, role, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), user.id === "admin" ? null : user.id, user.role, await hashToken(token), expiresAt).run();
  await db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind((/* @__PURE__ */ new Date()).toISOString()).run();
  return token;
}
__name(createSession, "createSession");
async function sessionFromRequest(c) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const row = await c.env.DB.prepare(
    `SELECT s.role, s.user_id, s.expires_at, u.nome, u.cognome, u.username, u.attivo
       FROM sessions s LEFT JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`
  ).bind(await hashToken(token)).first();
  if (!row || new Date(row.expires_at).getTime() <= Date.now()) return null;
  if (row.role === "admin") return { id: "admin", nome: "Admin", cognome: "", username: "admin", role: "admin" };
  if (row.user_id == null || !row.username || row.attivo === 0) return null;
  return { id: row.user_id, nome: row.nome ?? "", cognome: row.cognome ?? "", username: row.username, role: "user" };
}
__name(sessionFromRequest, "sessionFromRequest");
var USER_COLUMNS = "id, nome, cognome, username, email, ruolo, created_at, telefono, bio, note, qualifica, attivo, competenze_json, competenze_flag_json";
function userFromRow(row) {
  const competenze = parseJsonArray(row.competenze_json);
  const flag = parseJsonArray(row.competenze_flag_json);
  return {
    id: row.id,
    nome: row.nome,
    cognome: row.cognome,
    username: row.username,
    email: row.email ?? "",
    telefono: row.telefono ?? "",
    bio: row.bio ?? "",
    note: row.note ?? "",
    qualifica: row.qualifica ?? "",
    attivo: row.attivo !== 0,
    role: "user",
    ruolo: "user",
    competenze,
    competenzeFlag: flag,
    created_at: row.created_at
  };
}
__name(userFromRow, "userFromRow");
function eventFromRow(row) {
  return {
    id: row.id,
    code: row.code,
    nome: row.nome,
    data: row.data,
    ora_ritrovo: row.ora_ritrovo ?? "",
    ora_inizio: row.ora_inizio ?? "",
    ora_fine: row.ora_fine ?? "",
    luogo: row.luogo ?? "",
    tipo: row.tipo ?? "",
    descrizione: row.descrizione ?? "",
    info_operative: row.info_operative ?? "",
    referente_nome: row.referente_nome ?? "",
    referente_telefono: row.referente_telefono ?? "",
    compenso: row.compenso ?? "",
    compenso_visibile: row.compenso_visibile === 1,
    note_admin: row.note_admin ?? "",
    stato: row.stato,
    motivo_annullamento: row.motivo_annullamento ?? "",
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
__name(eventFromRow, "eventFromRow");
function loadRowFromRow(row) {
  return {
    id: row.id,
    event_id: row.event_id,
    item: row.item,
    categoria: row.categoria ?? "",
    codice: row.codice ?? "",
    taglia: row.taglia ?? "",
    quantita: row.quantita,
    assigned_user_id: row.assigned_user_id ?? null,
    assigned_name: row.assigned_nome ? `${row.assigned_nome} ${row.assigned_cognome}` : "",
    present: row.present === 1,
    returned: row.returned === 1,
    damaged: row.damaged === 1,
    comment: row.comment ?? "",
    updated_by: row.updated_by ?? "",
    updated_at: row.updated_at
  };
}
__name(loadRowFromRow, "loadRowFromRow");
var EVENT_STATES = ["richiesta", "da_definire", "confermato", "annullato", "chiuso"];
var PARTICIPANT_STATES = ["pending", "available", "unavailable", "confirmed", "rejected"];
async function notifyUser(db, userId, type, message, eventId) {
  const same = await db.prepare("SELECT id FROM notifications WHERE user_id = ? AND message = ? AND is_read = 0 LIMIT 1").bind(userId, message).first();
  if (same) return;
  await db.prepare("INSERT INTO notifications (user_id, for_admin, type, message, event_id) VALUES (?, 0, ?, ?, ?)").bind(userId, type, message, eventId).run();
}
__name(notifyUser, "notifyUser");
async function notifyAdmin(db, type, message, eventId) {
  await db.prepare("INSERT INTO notifications (user_id, for_admin, type, message, event_id) VALUES (NULL, 1, ?, ?, ?)").bind(type, message, eventId).run();
}
__name(notifyAdmin, "notifyAdmin");
app.use("/api/*", cors());
app.get("/api/health", async (c) => {
  try {
    await ensureSchema(c.env.DB);
    return c.json({ ok: true, service: "malastranapp-back", database: { ok: true, ...await schemaStatus(c.env.DB) } });
  } catch (err) {
    return c.json({ ok: false, service: "malastranapp-back", database: { ok: false, error: err instanceof Error ? err.message : String(err) } }, 500);
  }
});
app.use("/api/*", async (c, next) => {
  try {
    await ensureSchema(c.env.DB);
  } catch (err) {
    console.error("Errore preparazione database", err);
    return fail(c, 500, "Database non disponibile: " + (err instanceof Error ? err.message : String(err)));
  }
  await next();
});
app.use("/api/admin/*", async (c, next) => {
  const me = await sessionFromRequest(c);
  if (!me) return fail(c, 401, "Autenticazione richiesta");
  if (me.role !== "admin") return fail(c, 403, "Accesso amministratore richiesto");
  c.set("me", me);
  await next();
});
async function requireUser(c, next) {
  const me = await sessionFromRequest(c);
  if (!me) return fail(c, 401, "Autenticazione richiesta");
  if (me.role !== "user") return fail(c, 403, "Area riservata agli user");
  c.set("me", me);
  await next();
}
__name(requireUser, "requireUser");
app.use("/api/my/*", requireUser);
app.use("/api/profile", requireUser);
app.use("/api/profile/*", requireUser);
app.use("/api/notifications", async (c, next) => {
  const me = await sessionFromRequest(c);
  if (!me) return fail(c, 401, "Autenticazione richiesta");
  c.set("me", me);
  await next();
});
app.use("/api/notifications/*", async (c, next) => {
  const me = await sessionFromRequest(c);
  if (!me) return fail(c, 401, "Autenticazione richiesta");
  c.set("me", me);
  await next();
});
app.onError((err, c) => {
  console.error(err);
  return c.json({ success: false, error: "Errore interno del server: " + (err instanceof Error ? err.message : String(err)) }, 500);
});
app.post("/api/login", async (c) => {
  const b = await body(c);
  const username = b.username?.trim().toLowerCase() ?? "";
  const password = b.password ?? "";
  if (!username || !password) return fail(c, 400, "Inserisci username e password");
  if (username === "admin") {
    if (!c.env.ADMIN_PASSWORD) return fail(c, 500, "ADMIN_PASSWORD non configurata sul backend");
    if (password !== c.env.ADMIN_PASSWORD) return fail(c, 401, "Credenziali non valide");
    const user2 = { id: "admin", nome: "Admin", cognome: "", username: "admin", role: "admin" };
    return c.json({ success: true, token: await createSession(c.env.DB, user2), user: user2 });
  }
  const row = await c.env.DB.prepare("SELECT id, nome, cognome, username, password_hash, ruolo, attivo FROM users WHERE lower(username) = ? LIMIT 1").bind(username).first();
  if (!row || row.ruolo !== "user" || !await verifyPassword(password, row.password_hash)) return fail(c, 401, "Credenziali non valide");
  if (row.attivo === 0) return fail(c, 403, "Account disattivato: contatta l'admin");
  const user = { id: row.id, nome: row.nome, cognome: row.cognome, username: row.username, role: "user" };
  return c.json({ success: true, token: await createSession(c.env.DB, user), user });
});
app.get("/api/me", async (c) => {
  const me = await sessionFromRequest(c);
  if (!me) return fail(c, 401, "Sessione non valida o scaduta");
  if (me.role === "admin") return c.json({ success: true, user: me });
  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(me.id).first();
  return c.json({ success: true, user: row ? userFromRow(row) : me });
});
app.post("/api/logout", async (c) => {
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hashToken(header.slice(7).trim())).run();
  }
  return c.json({ success: true });
});
app.get("/api/profile", async (c) => {
  const me = c.get("me");
  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(me.id).first();
  if (!row) return fail(c, 404, "Profilo non trovato");
  return c.json({ success: true, user: userFromRow(row) });
});
app.patch("/api/profile", async (c) => {
  const me = c.get("me");
  const b = await body(c);
  const current = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(me.id).first();
  if (!current) return fail(c, 404, "Profilo non trovato");
  const u = userFromRow(current);
  const competenze = b.competenze !== void 0 ? tagList(b.competenze) : u.competenze;
  const flag = b.competenzeFlag !== void 0 ? tagList(b.competenzeFlag).filter((t) => competenze.includes(t)) : u.competenzeFlag;
  await c.env.DB.prepare("UPDATE users SET email = ?, telefono = ?, bio = ?, competenze_json = ?, competenze_flag_json = ? WHERE id = ?").bind(
    b.email !== void 0 ? str(b.email, 200) : u.email || null,
    b.telefono !== void 0 ? str(b.telefono, 50) : u.telefono || null,
    b.bio !== void 0 ? str(b.bio) : u.bio || null,
    JSON.stringify(competenze),
    JSON.stringify(flag),
    me.id
  ).run();
  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(me.id).first();
  return c.json({ success: true, user: userFromRow(row) });
});
app.post("/api/profile/password", async (c) => {
  const me = c.get("me");
  const b = await body(c);
  const nuova = b.nuova?.trim() ?? "";
  if (nuova.length < 6) return fail(c, 400, "La nuova password deve avere almeno 6 caratteri");
  const row = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(me.id).first();
  if (!row || !await verifyPassword(b.attuale ?? "", row.password_hash)) return fail(c, 400, "La password attuale non \xE8 corretta");
  await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(nuova), me.id).run();
  return c.json({ success: true });
});
app.get("/api/profile/costumes", async (c) => {
  const me = c.get("me");
  const rows = await c.env.DB.prepare("SELECT id, nome, categoria, note, created_at FROM user_costumes WHERE user_id = ? ORDER BY nome").bind(me.id).all();
  return c.json({ success: true, costumes: rows.results });
});
app.post("/api/profile/costumes", async (c) => {
  const me = c.get("me");
  const b = await body(c);
  const nome = str(b.nome, 120);
  if (!nome) return fail(c, 400, "Il nome del costume \xE8 obbligatorio");
  const r = await c.env.DB.prepare("INSERT INTO user_costumes (user_id, nome, categoria, note) VALUES (?, ?, ?, ?)").bind(me.id, nome, str(b.categoria, 80), str(b.note, 500)).run();
  return c.json({ success: true, id: r.meta.last_row_id }, 201);
});
app.patch("/api/profile/costumes/:cid", async (c) => {
  const me = c.get("me");
  const cid = intParam(c, "cid");
  const b = await body(c);
  const nome = str(b.nome, 120);
  if (!cid || !nome) return fail(c, 400, "Dati non validi");
  const r = await c.env.DB.prepare("UPDATE user_costumes SET nome = ?, categoria = ?, note = ? WHERE id = ? AND user_id = ?").bind(nome, str(b.categoria, 80), str(b.note, 500), cid, me.id).run();
  if (!r.meta.changes) return fail(c, 404, "Costume non trovato");
  return c.json({ success: true });
});
app.delete("/api/profile/costumes/:cid", async (c) => {
  const me = c.get("me");
  const cid = intParam(c, "cid");
  if (!cid) return fail(c, 400, "ID non valido");
  const r = await c.env.DB.prepare("DELETE FROM user_costumes WHERE id = ? AND user_id = ?").bind(cid, me.id).run();
  if (!r.meta.changes) return fail(c, 404, "Costume non trovato");
  return c.json({ success: true });
});
app.get("/api/admin/users", async (c) => {
  const rows = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE ruolo = 'user' ORDER BY cognome, nome`).all();
  const costumes = await c.env.DB.prepare("SELECT user_id, nome FROM user_costumes").all();
  const byUser = /* @__PURE__ */ new Map();
  for (const cst of costumes.results) byUser.set(cst.user_id, [...byUser.get(cst.user_id) ?? [], cst.nome]);
  return c.json({ success: true, users: rows.results.map((r) => ({ ...userFromRow(r), costumi: byUser.get(r.id) ?? [] })) });
});
app.post("/api/admin/users", async (c) => {
  const b = await body(c);
  const nome = str(b.nome, 80);
  const cognome = str(b.cognome, 80);
  const password = typeof b.password === "string" ? b.password.trim() : "";
  if (!nome || !cognome) return fail(c, 400, "Nome e cognome sono obbligatori");
  if (password.length < 6) return fail(c, 400, "La password \xE8 obbligatoria e deve avere almeno 6 caratteri");
  const custom = typeof b.username === "string" ? b.username.trim() : "";
  if (custom && !/^[A-Za-z0-9._-]{3,40}$/.test(custom)) return fail(c, 400, "Lo username pu\xF2 contenere solo lettere, numeri, punto, trattino e trattino basso (3-40 caratteri, senza spazi)");
  const username = custom || `${normalizePart(nome)}.${normalizePart(cognome)}`;
  if (username.toLowerCase() === "admin") return fail(c, 400, "Lo username 'admin' \xE8 riservato");
  const exists = await c.env.DB.prepare("SELECT id FROM users WHERE lower(username) = ?").bind(username.toLowerCase()).first();
  if (exists) return fail(c, 409, `Esiste gi\xE0 uno user con username ${username}`);
  const competenze = tagList(b.competenze);
  const flag = tagList(b.competenzeFlag).filter((t) => competenze.includes(t));
  const r = await c.env.DB.prepare(
    `INSERT INTO users (nome, cognome, username, email, password_hash, ruolo, telefono, bio, note, qualifica, competenze_json, competenze_flag_json)
       VALUES (?, ?, ?, ?, ?, 'user', ?, ?, ?, ?, ?, ?)`
  ).bind(nome, cognome, username, str(b.email, 200), await hashPassword(password), str(b.telefono, 50), str(b.bio), str(b.note), str(b.qualifica, 120), JSON.stringify(competenze), JSON.stringify(flag)).run();
  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(r.meta.last_row_id).first();
  return c.json({ success: true, user: userFromRow(row) }, 201);
});
app.get("/api/admin/users/:id", async (c) => {
  const id = intParam(c, "id");
  if (!id) return fail(c, 400, "ID non valido");
  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? AND ruolo = 'user'`).bind(id).first();
  if (!row) return fail(c, 404, "User non trovato");
  const costumes = await c.env.DB.prepare("SELECT id, nome, categoria, note FROM user_costumes WHERE user_id = ? ORDER BY nome").bind(id).all();
  const events = await c.env.DB.prepare(
    `SELECT e.code, e.nome, e.data, e.stato AS stato_evento, p.stato FROM event_participants p
       JOIN events e ON e.id = p.event_id WHERE p.user_id = ? ORDER BY e.data DESC`
  ).bind(id).all();
  return c.json({ success: true, user: userFromRow(row), costumes: costumes.results, events: events.results });
});
app.patch("/api/admin/users/:id", async (c) => {
  const id = intParam(c, "id");
  if (!id) return fail(c, 400, "ID non valido");
  const current = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? AND ruolo = 'user'`).bind(id).first();
  if (!current) return fail(c, 404, "User non trovato");
  const u = userFromRow(current);
  const b = await body(c);
  const competenze = b.competenze !== void 0 ? tagList(b.competenze) : u.competenze;
  const flag = b.competenzeFlag !== void 0 ? tagList(b.competenzeFlag).filter((t) => competenze.includes(t)) : u.competenzeFlag;
  await c.env.DB.prepare(
    `UPDATE users SET nome = ?, cognome = ?, email = ?, telefono = ?, bio = ?, note = ?, qualifica = ?, attivo = ?,
       competenze_json = ?, competenze_flag_json = ? WHERE id = ?`
  ).bind(
    b.nome !== void 0 ? str(b.nome, 80) ?? u.nome : u.nome,
    b.cognome !== void 0 ? str(b.cognome, 80) ?? u.cognome : u.cognome,
    b.email !== void 0 ? str(b.email, 200) : u.email || null,
    b.telefono !== void 0 ? str(b.telefono, 50) : u.telefono || null,
    b.bio !== void 0 ? str(b.bio) : u.bio || null,
    b.note !== void 0 ? str(b.note) : u.note || null,
    b.qualifica !== void 0 ? str(b.qualifica, 120) : u.qualifica || null,
    b.attivo !== void 0 ? bool(b.attivo) : u.attivo ? 1 : 0,
    JSON.stringify(competenze),
    JSON.stringify(flag),
    id
  ).run();
  if (b.attivo !== void 0 && !bool(b.attivo)) await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(id).first();
  return c.json({ success: true, user: userFromRow(row) });
});
app.patch("/api/admin/users/:id/password", async (c) => {
  const id = intParam(c, "id");
  const b = await body(c);
  const password = typeof b.password === "string" ? b.password.trim() : "";
  if (!id) return fail(c, 400, "ID non valido");
  if (password.length < 6) return fail(c, 400, "La password deve avere almeno 6 caratteri");
  const r = await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ? AND ruolo = 'user'").bind(await hashPassword(password), id).run();
  if (!r.meta.changes) return fail(c, 404, "User non trovato");
  await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
  return c.json({ success: true });
});
app.delete("/api/admin/users/:id", async (c) => {
  const id = intParam(c, "id");
  if (!id) return fail(c, 400, "ID non valido");
  await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
  await c.env.DB.prepare("UPDATE load_rows SET assigned_user_id = NULL WHERE assigned_user_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM notifications WHERE user_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM event_participants WHERE user_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM user_costumes WHERE user_id = ?").bind(id).run();
  const r = await c.env.DB.prepare("DELETE FROM users WHERE id = ? AND ruolo = 'user'").bind(id).run();
  if (!r.meta.changes) return fail(c, 404, "User non trovato");
  return c.json({ success: true });
});
app.post("/api/admin/users/:id/costumes", async (c) => {
  const id = intParam(c, "id");
  const b = await body(c);
  const nome = str(b.nome, 120);
  if (!id || !nome) return fail(c, 400, "Il nome del costume \xE8 obbligatorio");
  const exists = await c.env.DB.prepare("SELECT id FROM users WHERE id = ? AND ruolo = 'user'").bind(id).first();
  if (!exists) return fail(c, 404, "User non trovato");
  const r = await c.env.DB.prepare("INSERT INTO user_costumes (user_id, nome, categoria, note) VALUES (?, ?, ?, ?)").bind(id, nome, str(b.categoria, 80), str(b.note, 500)).run();
  return c.json({ success: true, id: r.meta.last_row_id }, 201);
});
app.delete("/api/admin/users/:id/costumes/:cid", async (c) => {
  const id = intParam(c, "id");
  const cid = intParam(c, "cid");
  if (!id || !cid) return fail(c, 400, "ID non valido");
  const r = await c.env.DB.prepare("DELETE FROM user_costumes WHERE id = ? AND user_id = ?").bind(cid, id).run();
  if (!r.meta.changes) return fail(c, 404, "Costume non trovato");
  return c.json({ success: true });
});
var EVENT_FIELDS = [
  "nome",
  "data",
  "ora_ritrovo",
  "ora_inizio",
  "ora_fine",
  "luogo",
  "tipo",
  "descrizione",
  "info_operative",
  "referente_nome",
  "referente_telefono",
  "compenso",
  "note_admin",
  "motivo_annullamento"
];
async function eventByCode(db, code) {
  return db.prepare("SELECT * FROM events WHERE code = ?").bind(code).first();
}
__name(eventByCode, "eventByCode");
async function newEventCode(db, date) {
  const base = `MAL-${date.replace(/-/g, "").slice(2, 8)}`;
  const rows = await db.prepare("SELECT code FROM events WHERE code LIKE ?").bind(`${base}-%`).all();
  let n = rows.results.length + 1;
  const used = new Set(rows.results.map((r) => r.code));
  while (used.has(`${base}-${String(n).padStart(2, "0")}`)) n += 1;
  return `${base}-${String(n).padStart(2, "0")}`;
}
__name(newEventCode, "newEventCode");
app.get("/api/admin/events", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT e.*,
        (SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id) AS invitati,
        (SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id AND p.stato = 'pending') AS in_attesa,
        (SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id AND p.stato = 'available') AS disponibili,
        (SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id AND p.stato = 'confirmed') AS confermati,
        (SELECT COUNT(*) FROM load_rows l WHERE l.event_id = e.id) AS righe_bolla,
        (SELECT COUNT(*) FROM load_rows l WHERE l.event_id = e.id AND l.damaged = 1) AS danni
       FROM events e ORDER BY e.data, e.ora_inizio`
  ).all();
  return c.json({
    success: true,
    events: rows.results.map((r) => ({
      ...eventFromRow(r),
      conteggi: { invitati: r.invitati, in_attesa: r.in_attesa, disponibili: r.disponibili, confermati: r.confermati, righe_bolla: r.righe_bolla, danni: r.danni }
    }))
  });
});
app.post("/api/admin/events", async (c) => {
  const b = await body(c);
  const nome = str(b.nome, 160);
  const data = str(b.data, 10);
  if (!nome) return fail(c, 400, "Il nome dell'evento \xE8 obbligatorio");
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return fail(c, 400, "La data dell'evento \xE8 obbligatoria (formato AAAA-MM-GG)");
  const stato = typeof b.stato === "string" && EVENT_STATES.includes(b.stato) ? b.stato : "richiesta";
  const code = await newEventCode(c.env.DB, data);
  const values = EVENT_FIELDS.map((f) => f === "nome" ? nome : f === "data" ? data : str(b[f]));
  await c.env.DB.prepare(`INSERT INTO events (code, ${EVENT_FIELDS.join(", ")}, compenso_visibile, stato) VALUES (?, ${EVENT_FIELDS.map(() => "?").join(", ")}, ?, ?)`).bind(code, ...values, bool(b.compenso_visibile), stato).run();
  const ev = await eventByCode(c.env.DB, code);
  const event = eventFromRow(ev);
  const ids = Array.isArray(b.user_ids) ? b.user_ids.filter((x) => Number.isInteger(x)) : [];
  for (const uid of ids) await inviteUser(c.env.DB, event.id, event.nome, uid);
  return c.json({ success: true, event }, 201);
});
app.get("/api/admin/events/:code", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  if (!ev) return fail(c, 404, "Evento non trovato");
  const event = eventFromRow(ev);
  const participants = await c.env.DB.prepare(
    `SELECT p.*, u.nome, u.cognome, u.username, u.qualifica FROM event_participants p
       JOIN users u ON u.id = p.user_id WHERE p.event_id = ? ORDER BY u.cognome, u.nome`
  ).bind(event.id).all();
  const rows = await c.env.DB.prepare(
    `SELECT l.*, u.nome AS assigned_nome, u.cognome AS assigned_cognome FROM load_rows l
       LEFT JOIN users u ON u.id = l.assigned_user_id WHERE l.event_id = ? ORDER BY l.id`
  ).bind(event.id).all();
  return c.json({ success: true, event, participants: participants.results, load_rows: rows.results.map(loadRowFromRow) });
});
app.patch("/api/admin/events/:code", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  if (!ev) return fail(c, 404, "Evento non trovato");
  const event = eventFromRow(ev);
  const b = await body(c);
  const sets = [];
  const vals = [];
  for (const f of EVENT_FIELDS) {
    if (b[f] === void 0) continue;
    const v = str(b[f]);
    if ((f === "nome" || f === "data") && !v) return fail(c, 400, `Il campo ${f} non pu\xF2 essere vuoto`);
    if (f === "data" && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return fail(c, 400, "Data non valida (formato AAAA-MM-GG)");
    sets.push(`${f} = ?`);
    vals.push(v);
  }
  if (b.compenso_visibile !== void 0) {
    sets.push("compenso_visibile = ?");
    vals.push(bool(b.compenso_visibile));
  }
  if (b.stato !== void 0) {
    if (typeof b.stato !== "string" || !EVENT_STATES.includes(b.stato)) return fail(c, 400, "Stato evento non valido");
    sets.push("stato = ?");
    vals.push(b.stato);
  }
  if (!sets.length) return c.json({ success: true, event });
  sets.push("updated_at = datetime('now')");
  await c.env.DB.prepare(`UPDATE events SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, event.id).run();
  const updated = eventFromRow(await c.env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(event.id).first());
  const message = b.stato === "annullato" && event.stato !== "annullato" ? `L'evento ${updated.nome} del ${updated.data} \xE8 stato annullato` : `L'evento ${updated.nome} \xE8 stato aggiornato`;
  const people = await c.env.DB.prepare("SELECT user_id FROM event_participants WHERE event_id = ? AND stato IN ('pending', 'available', 'confirmed')").bind(event.id).all();
  if (b.notify !== false) for (const p of people.results) await notifyUser(c.env.DB, p.user_id, "evento_modificato", message, event.id);
  return c.json({ success: true, event: updated });
});
app.delete("/api/admin/events/:code", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  if (!ev) return fail(c, 404, "Evento non trovato");
  const id = ev.id;
  await c.env.DB.prepare("DELETE FROM notifications WHERE event_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM load_rows WHERE event_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM event_participants WHERE event_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM events WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});
async function inviteUser(db, eventId, eventName, userId, ruolo) {
  const u = await db.prepare("SELECT id FROM users WHERE id = ? AND ruolo = 'user'").bind(userId).first();
  if (!u) return false;
  const r = await db.prepare("INSERT INTO event_participants (event_id, user_id, stato, ruolo_evento) VALUES (?, ?, 'pending', ?) ON CONFLICT(event_id, user_id) DO NOTHING").bind(eventId, userId, ruolo ?? null).run();
  if (r.meta.changes) await notifyUser(db, userId, "richiesta", `Nuova richiesta di disponibilit\xE0 per ${eventName}`, eventId);
  return true;
}
__name(inviteUser, "inviteUser");
app.post("/api/admin/events/:code/participants", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  if (!ev) return fail(c, 404, "Evento non trovato");
  const b = await body(c);
  const ids = Array.isArray(b.user_ids) ? b.user_ids.filter((x) => Number.isInteger(x)) : [];
  if (!ids.length) return fail(c, 400, "Seleziona almeno uno user");
  for (const uid of ids) await inviteUser(c.env.DB, ev.id, ev.nome, uid, str(b.ruolo_evento, 120));
  return c.json({ success: true });
});
app.patch("/api/admin/events/:code/participants/:userId", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  const userId = intParam(c, "userId");
  if (!ev || !userId) return fail(c, 404, "Evento o user non trovato");
  const current = await c.env.DB.prepare("SELECT * FROM event_participants WHERE event_id = ? AND user_id = ?").bind(ev.id, userId).first();
  if (!current) return fail(c, 404, "Questo user non \xE8 coinvolto nell'evento");
  const b = await body(c);
  const sets = [];
  const vals = [];
  if (b.stato !== void 0) {
    if (typeof b.stato !== "string" || !PARTICIPANT_STATES.includes(b.stato)) return fail(c, 400, "Stato non valido");
    sets.push("stato = ?", "decided_at = datetime('now')");
    vals.push(b.stato);
  }
  if (b.ruolo_evento !== void 0) {
    sets.push("ruolo_evento = ?");
    vals.push(str(b.ruolo_evento, 120));
  }
  if (b.nota_admin !== void 0) {
    sets.push("nota_admin = ?");
    vals.push(str(b.nota_admin, 1e3));
  }
  if (!sets.length) return c.json({ success: true });
  await c.env.DB.prepare(`UPDATE event_participants SET ${sets.join(", ")} WHERE event_id = ? AND user_id = ?`).bind(...vals, ev.id, userId).run();
  if (b.stato === "confirmed" && current.stato !== "confirmed") await notifyUser(c.env.DB, userId, "confermato", `Sei stato confermato per ${ev.nome}`, ev.id);
  if (b.stato === "rejected" && current.stato !== "rejected") await notifyUser(c.env.DB, userId, "non_confermato", `Non sei stato selezionato per ${ev.nome}`, ev.id);
  return c.json({ success: true });
});
app.delete("/api/admin/events/:code/participants/:userId", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  const userId = intParam(c, "userId");
  if (!ev || !userId) return fail(c, 404, "Evento o user non trovato");
  await c.env.DB.prepare("DELETE FROM event_participants WHERE event_id = ? AND user_id = ?").bind(ev.id, userId).run();
  await c.env.DB.prepare("UPDATE load_rows SET assigned_user_id = NULL WHERE event_id = ? AND assigned_user_id = ?").bind(ev.id, userId).run();
  return c.json({ success: true });
});
function loadRowValues(b) {
  const qty = Number(b.quantita);
  return {
    item: str(b.item, 160),
    categoria: str(b.categoria, 60),
    codice: str(b.codice, 60),
    taglia: str(b.taglia, 30),
    quantita: Number.isInteger(qty) && qty > 0 ? qty : 1,
    assigned: Number.isInteger(b.assigned_user_id) ? b.assigned_user_id : null
  };
}
__name(loadRowValues, "loadRowValues");
app.post("/api/admin/events/:code/load-rows", async (c) => {
  const ev = await eventByCode(c.env.DB, c.req.param("code"));
  if (!ev) return fail(c, 404, "Evento non trovato");
  const b = await body(c);
  const list = Array.isArray(b.rows) ? b.rows : [b];
  const notified = /* @__PURE__ */ new Set();
  let added = 0;
  for (const raw2 of list.slice(0, 500)) {
    const v = loadRowValues(raw2);
    if (!v.item) continue;
    await c.env.DB.prepare("INSERT INTO load_rows (event_id, item, categoria, codice, taglia, quantita, assigned_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(ev.id, v.item, v.categoria, v.codice, v.taglia, v.quantita, v.assigned).run();
    added += 1;
    if (v.assigned && !notified.has(v.assigned)) {
      notified.add(v.assigned);
      await notifyUser(c.env.DB, v.assigned, "bolla", `Bolla di carico aggiornata per ${ev.nome}`, ev.id);
    }
  }
  if (!added) return fail(c, 400, "Nessuna riga valida: serve almeno il nome dell'oggetto");
  return c.json({ success: true, added }, 201);
});
app.patch("/api/admin/load-rows/:rid", async (c) => {
  const rid = intParam(c, "rid");
  if (!rid) return fail(c, 400, "ID non valido");
  const row = await c.env.DB.prepare("SELECT l.*, e.nome AS event_nome FROM load_rows l JOIN events e ON e.id = l.event_id WHERE l.id = ?").bind(rid).first();
  if (!row) return fail(c, 404, "Riga non trovata");
  const b = await body(c);
  const sets = [];
  const vals = [];
  for (const f of ["item", "categoria", "codice", "taglia", "comment"]) {
    if (b[f] === void 0) continue;
    const v = str(b[f], f === "comment" ? 1e3 : 160);
    if (f === "item" && !v) return fail(c, 400, "Il nome dell'oggetto non pu\xF2 essere vuoto");
    sets.push(`${f} = ?`);
    vals.push(v);
  }
  if (b.quantita !== void 0) {
    const q = Number(b.quantita);
    sets.push("quantita = ?");
    vals.push(Number.isInteger(q) && q > 0 ? q : 1);
  }
  for (const f of ["present", "returned", "damaged"]) {
    if (b[f] === void 0) continue;
    sets.push(`${f} = ?`);
    vals.push(bool(b[f]));
  }
  let newAssignee = null;
  if (b.assigned_user_id !== void 0) {
    newAssignee = Number.isInteger(b.assigned_user_id) ? b.assigned_user_id : null;
    sets.push("assigned_user_id = ?");
    vals.push(newAssignee);
  }
  if (!sets.length) return c.json({ success: true });
  sets.push("updated_by = 'admin'", "updated_at = datetime('now')");
  await c.env.DB.prepare(`UPDATE load_rows SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, rid).run();
  if (newAssignee && newAssignee !== row.assigned_user_id) await notifyUser(c.env.DB, newAssignee, "bolla", `Bolla di carico aggiornata per ${row.event_nome}`, row.event_id);
  return c.json({ success: true });
});
app.delete("/api/admin/load-rows/:rid", async (c) => {
  const rid = intParam(c, "rid");
  if (!rid) return fail(c, 400, "ID non valido");
  await c.env.DB.prepare("DELETE FROM load_rows WHERE id = ?").bind(rid).run();
  return c.json({ success: true });
});
app.get("/api/admin/report", async (c) => {
  const code = c.req.query("event");
  const onlyIssues = c.req.query("solo_problemi") === "1";
  const where = [];
  const vals = [];
  if (code) {
    where.push("e.code = ?");
    vals.push(code);
  }
  if (onlyIssues) where.push("(l.damaged = 1 OR (l.comment IS NOT NULL AND l.comment != '') OR (l.present = 1 AND l.returned = 0))");
  const rows = await c.env.DB.prepare(
    `SELECT l.*, e.code AS event_code, e.nome AS event_nome, e.data AS event_data, u.nome AS assigned_nome, u.cognome AS assigned_cognome
       FROM load_rows l JOIN events e ON e.id = l.event_id LEFT JOIN users u ON u.id = l.assigned_user_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY e.data DESC, l.id`
  ).bind(...vals).all();
  return c.json({
    success: true,
    rows: rows.results.map((r) => ({ ...loadRowFromRow(r), event_code: r.event_code, event_nome: r.event_nome, event_data: r.event_data }))
  });
});
function eventForUser(row, myStato) {
  const e = eventFromRow(row);
  const showFee = e.compenso_visibile && myStato === "confirmed";
  return {
    id: e.id,
    code: e.code,
    nome: e.nome,
    data: e.data,
    ora_ritrovo: e.ora_ritrovo,
    ora_inizio: e.ora_inizio,
    ora_fine: e.ora_fine,
    luogo: e.luogo,
    tipo: e.tipo,
    descrizione: e.descrizione,
    stato: e.stato,
    motivo_annullamento: e.motivo_annullamento,
    // informazioni operative e referente solo a chi è confermato
    info_operative: myStato === "confirmed" ? e.info_operative : "",
    referente_nome: myStato === "confirmed" ? e.referente_nome : "",
    referente_telefono: myStato === "confirmed" ? e.referente_telefono : "",
    compenso: showFee ? e.compenso : ""
  };
}
__name(eventForUser, "eventForUser");
app.get("/api/my/events", async (c) => {
  const me = c.get("me");
  const rows = await c.env.DB.prepare(
    `SELECT e.*, p.stato AS mio_stato, p.ruolo_evento,
        (SELECT COUNT(*) FROM load_rows l WHERE l.event_id = e.id AND l.assigned_user_id = ?) AS mie_righe
       FROM event_participants p JOIN events e ON e.id = p.event_id WHERE p.user_id = ? ORDER BY e.data, e.ora_inizio`
  ).bind(me.id, me.id).all();
  return c.json({
    success: true,
    events: rows.results.map((r) => ({ ...eventForUser(r, r.mio_stato), mio_stato: r.mio_stato, ruolo_evento: r.ruolo_evento ?? "", mie_righe_bolla: r.mie_righe }))
  });
});
async function myParticipation(c, code) {
  const me = c.get("me");
  return c.env.DB.prepare(
    `SELECT e.*, p.stato AS mio_stato, p.ruolo_evento, p.nota_user, p.nota_admin FROM events e
       JOIN event_participants p ON p.event_id = e.id WHERE e.code = ? AND p.user_id = ?`
  ).bind(code, me.id).first();
}
__name(myParticipation, "myParticipation");
app.get("/api/my/events/:code", async (c) => {
  const me = c.get("me");
  const row = await myParticipation(c, c.req.param("code"));
  if (!row) return fail(c, 404, "Evento non trovato o non sei coinvolto");
  const stato = row.mio_stato;
  const team = stato === "confirmed" ? (await c.env.DB.prepare("SELECT u.nome, u.cognome, p.ruolo_evento FROM event_participants p JOIN users u ON u.id = p.user_id WHERE p.event_id = ? AND p.stato = 'confirmed' ORDER BY u.cognome").bind(row.id).all()).results : [];
  const rows = await c.env.DB.prepare("SELECT * FROM load_rows WHERE event_id = ? AND assigned_user_id = ? ORDER BY id").bind(row.id, me.id).all();
  return c.json({
    success: true,
    event: eventForUser(row, stato),
    partecipazione: { stato, ruolo_evento: row.ruolo_evento ?? "", nota_user: row.nota_user ?? "", nota_admin: row.nota_admin ?? "" },
    team,
    load_rows: rows.results.map(loadRowFromRow)
  });
});
app.post("/api/my/events/:code/availability", async (c) => {
  const me = c.get("me");
  const row = await myParticipation(c, c.req.param("code"));
  if (!row) return fail(c, 404, "Evento non trovato o non sei coinvolto");
  const b = await body(c);
  const stato = b.stato;
  if (stato !== "available" && stato !== "unavailable") return fail(c, 400, "Risposta non valida");
  if (row.mio_stato === "confirmed" || row.mio_stato === "rejected") return fail(c, 409, "L'admin ha gi\xE0 deciso: per cambiare contatta l'ufficio");
  if (row.stato === "annullato" || row.stato === "chiuso") return fail(c, 409, "L'evento non accetta pi\xF9 risposte");
  await c.env.DB.prepare("UPDATE event_participants SET stato = ?, nota_user = ?, responded_at = datetime('now') WHERE event_id = ? AND user_id = ?").bind(stato, str(b.nota, 1e3), row.id, me.id).run();
  const who = `${me.nome} ${me.cognome}`.trim();
  await notifyAdmin(
    c.env.DB,
    "risposta",
    stato === "available" ? `${who} ha dato disponibilit\xE0 per ${row.nome}` : `${who} non \xE8 disponibile per ${row.nome}`,
    row.id
  );
  return c.json({ success: true });
});
app.patch("/api/my/load-rows/:rid", async (c) => {
  const me = c.get("me");
  const rid = intParam(c, "rid");
  if (!rid) return fail(c, 400, "ID non valido");
  const row = await c.env.DB.prepare(
    `SELECT l.*, e.nome AS event_nome, e.stato AS event_stato, p.stato AS mio_stato FROM load_rows l
       JOIN events e ON e.id = l.event_id
       LEFT JOIN event_participants p ON p.event_id = l.event_id AND p.user_id = ?
       WHERE l.id = ?`
  ).bind(me.id, rid).first();
  if (!row || row.assigned_user_id !== me.id) return fail(c, 403, "Questa riga della bolla non \xE8 assegnata a te");
  if (row.mio_stato !== "confirmed") return fail(c, 403, "Puoi compilare la bolla solo dopo la conferma per l'evento");
  const b = await body(c);
  const sets = [];
  const vals = [];
  for (const f of ["present", "returned", "damaged"]) {
    if (b[f] === void 0) continue;
    sets.push(`${f} = ?`);
    vals.push(bool(b[f]));
  }
  if (b.comment !== void 0) {
    sets.push("comment = ?");
    vals.push(str(b.comment, 1e3));
  }
  if (!sets.length) return c.json({ success: true });
  sets.push("updated_by = ?", "updated_at = datetime('now')");
  vals.push(`${me.nome} ${me.cognome}`.trim());
  await c.env.DB.prepare(`UPDATE load_rows SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, rid).run();
  if (b.damaged !== void 0 && bool(b.damaged) && row.damaged !== 1) {
    await notifyAdmin(c.env.DB, "danno", `${me.nome} ${me.cognome} ha segnalato un danno: ${row.item} (${row.event_nome})`, row.event_id);
  }
  const updated = await c.env.DB.prepare("SELECT * FROM load_rows WHERE id = ?").bind(rid).first();
  return c.json({ success: true, row: loadRowFromRow(updated) });
});
function notificationScope(me) {
  return me.role === "admin" ? ["for_admin = 1", []] : ["user_id = ?", [me.id]];
}
__name(notificationScope, "notificationScope");
app.get("/api/notifications", async (c) => {
  const me = c.get("me");
  const [where, vals] = notificationScope(me);
  const rows = await c.env.DB.prepare(
    `SELECT n.id, n.type, n.message, n.is_read, n.created_at, e.code AS event_code FROM notifications n
       LEFT JOIN events e ON e.id = n.event_id WHERE ${where} ORDER BY n.created_at DESC, n.id DESC LIMIT 100`
  ).bind(...vals).all();
  const unread = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE ${where} AND is_read = 0`).bind(...vals).first();
  return c.json({
    success: true,
    unread: unread?.n ?? 0,
    notifications: rows.results.map((r) => ({ ...r, is_read: r.is_read === 1 }))
  });
});
app.post("/api/notifications/read-all", async (c) => {
  const me = c.get("me");
  const [where, vals] = notificationScope(me);
  await c.env.DB.prepare(`UPDATE notifications SET is_read = 1 WHERE ${where}`).bind(...vals).run();
  return c.json({ success: true });
});
app.post("/api/notifications/:nid/read", async (c) => {
  const me = c.get("me");
  const nid = intParam(c, "nid");
  if (!nid) return fail(c, 400, "ID non valido");
  const [where, vals] = notificationScope(me);
  await c.env.DB.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND ${where}`).bind(nid, ...vals).run();
  return c.json({ success: true });
});
app.all("/api/*", (c) => fail(c, 404, "Indirizzo API inesistente"));
var src_default = app;

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body2 = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body2);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body2, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-5Kj3Ce/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-5Kj3Ce/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
