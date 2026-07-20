type JsonRecord = Record<string, unknown>;

type ProductId = string | number;

interface MediaItem extends JsonRecord {
  url: string;
  type: "image" | "video" | "document";
}

interface Product extends JsonRecord {
  id: ProductId;
  name: string;
  category?: string;
  price?: string | number;
  desc?: string;
  tags?: string[];
  includes?: string[];
  badge?: string;
  ptype?: string;
  media?: unknown;
  imageUrl?: string;
  deliveryLink?: string;
  origPrice?: string | number;
  sold?: string | number;
  active?: boolean;
  stripeLink?: string;
}

interface StoreData extends JsonRecord {
  products?: Product[];
  content?: JsonRecord;
  gallery?: unknown[];
  wall?: unknown;
}

interface AdminUser {
  email: string;
}

interface AdminSession {
  authenticated: boolean;
  user: AdminUser;
}

interface StoreResponse {
  data: StoreData;
  updatedAt: string;
}

interface UploadResponse {
  path: string;
  url: string;
  mimeType: string;
  size: number;
}

interface SignedUploadResponse {
  path: string;
  url?: string;
  publicUrl?: string;
  signedUrl: string;
  token?: string;
  method: "PUT";
  mimeType: string;
  maxBytes: number;
}

interface Order extends JsonRecord {
  id?: string;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  productId?: ProductId;
  productName?: string;
  buyerEmail?: string;
  amountTotal?: number;
  currency?: string;
  status?: string;
  deliveryLink?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface OrdersResponse {
  orders: Order[];
  limit: number;
  offset: number;
}

type AdminTab = "products" | "content" | "wall" | "orders";
type ToastKind = "success" | "error" | "info";

interface ProductIssue {
  field: "name" | "price" | "deliveryLink";
  message: string;
}

class AdminApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.payload = payload;
  }
}

const API_ROOT = "/api/admin";
const DIRECT_UPLOAD_BYTES = 2.5 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ORDER_PAGE_SIZE = 50;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function messageFromPayload(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;
  const candidates = [payload.error, payload.message, payload.error_description];
  const message = candidates.find((value) => typeof value === "string");
  return typeof message === "string" && message.trim() ? message : fallback;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      headers,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new AdminApiError("Could not reach the admin service. Check your connection and try again.", 0, null);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new AdminApiError(
      messageFromPayload(payload, response.status === 409 ? "The store changed in another session." : "The request failed."),
      response.status,
      payload,
    );
  }

  return payload as T;
}

const adminApi = {
  session: (): Promise<AdminSession> => request<AdminSession>("/session"),
  login: (email: string, password: string): Promise<AdminSession> =>
    request<AdminSession>("/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: (): Promise<{ ok: boolean }> => request<{ ok: boolean }>("/logout", { method: "POST" }),
  store: (): Promise<StoreResponse> => request<StoreResponse>("/store"),
  saveStore: (data: StoreData, expectedUpdatedAt: string | null): Promise<StoreResponse> =>
    request<StoreResponse>("/store", {
      method: "PUT",
      body: JSON.stringify({ data, expectedUpdatedAt }),
    }),
  upload: (fileName: string, contentType: string, dataBase64: string): Promise<UploadResponse> =>
    request<UploadResponse>("/upload", {
      method: "POST",
      body: JSON.stringify({ fileName, contentType, dataBase64 }),
    }),
  createSignedUpload: (fileName: string, contentType: string, size: number): Promise<SignedUploadResponse> =>
    request<SignedUploadResponse>("/upload", {
      method: "POST",
      body: JSON.stringify({ fileName, contentType, size }),
    }),
  orders: (limit: number, offset: number): Promise<OrdersResponse> =>
    request<OrdersResponse>(`/orders?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`),
};

function normaliseSession(value: unknown): AdminSession {
  if (!isRecord(value) || value.authenticated !== true || !isRecord(value.user) || typeof value.user.email !== "string") {
    throw new AdminApiError("The admin session response was invalid.", 500, value);
  }
  return { authenticated: true, user: { email: value.user.email } };
}

function normaliseStoreResponse(value: unknown): StoreResponse {
  if (!isRecord(value) || !isRecord(value.data)) {
    throw new AdminApiError("The store response was invalid.", 500, value);
  }
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : "";
  if (!updatedAt) {
    throw new AdminApiError("The store response did not include a version timestamp.", 500, value);
  }
  return { data: value.data as StoreData, updatedAt };
}

function normaliseUploadResponse(value: unknown): UploadResponse {
  if (!isRecord(value) || typeof value.url !== "string" || !value.url.trim()) {
    throw new AdminApiError("The upload completed without a usable file URL.", 500, value);
  }
  return {
    path: typeof value.path === "string" ? value.path : "",
    url: value.url,
    mimeType: typeof value.mimeType === "string" ? value.mimeType : "application/octet-stream",
    size: typeof value.size === "number" ? value.size : 0,
  };
}

function normaliseOrdersResponse(value: unknown): OrdersResponse {
  if (!isRecord(value) || !Array.isArray(value.orders)) {
    throw new AdminApiError("The orders response was invalid.", 500, value);
  }
  return {
    orders: value.orders.filter(isRecord) as Order[],
    limit: typeof value.limit === "number" ? value.limit : ORDER_PAGE_SIZE,
    offset: typeof value.offset === "number" ? value.offset : 0,
  };
}

function productsFromStore(store: StoreData): Product[] {
  return Array.isArray(store.products) ? store.products.filter(isRecord) as Product[] : [];
}

function productMedia(product: Product): MediaItem[] {
  const result: MediaItem[] = [];
  if (Array.isArray(product.media)) {
    for (const rawItem of product.media) {
      if (typeof rawItem === "string" && rawItem.trim()) {
        result.push({ url: rawItem, type: mediaTypeFromUrl(rawItem) });
      } else if (isRecord(rawItem) && typeof rawItem.url === "string" && rawItem.url.trim()) {
        const statedType = rawItem.type;
        const type = statedType === "video" || statedType === "document" || statedType === "image"
          ? statedType
          : mediaTypeFromUrl(rawItem.url);
        result.push({ ...rawItem, url: rawItem.url, type });
      }
    }
  } else if (typeof product.media === "string" && product.media.trim()) {
    result.push({ url: product.media, type: mediaTypeFromUrl(product.media) });
  }
  if (!result.length && typeof product.imageUrl === "string" && product.imageUrl.trim()) {
    result.push({ url: product.imageUrl, type: "image" });
  }
  return result;
}

function setProductMedia(product: Product, media: MediaItem[]): void {
  product.media = media;
  const firstImage = media.find((item) => item.type === "image");
  product.imageUrl = firstImage?.url ?? media[0]?.url ?? "";
}

function mediaTypeFromUrl(url: string): MediaItem["type"] {
  const clean = url.split(/[?#]/, 1)[0].toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogv)$/.test(clean)) return "video";
  if (/\.(pdf)$/.test(clean)) return "document";
  return "image";
}

function mediaTypeFromMime(mimeType: string): MediaItem["type"] {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "document";
  return "image";
}

function safeAssetUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const candidate = value.trim();
  if (/^data:(image|video)\/[a-z0-9.+-]+;base64,/i.test(candidate)) return candidate;
  try {
    const parsed = new URL(candidate, window.location.origin);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function validRemoteUrl(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function validDeliveryUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

function productIssues(product: Product): ProductIssue[] {
  const issues: ProductIssue[] = [];
  if (!String(product.name ?? "").trim()) {
    issues.push({ field: "name", message: "Add a product name." });
  }
  if (product.active !== false) {
    const priceText = String(product.price ?? "").trim();
    const price = Number(priceText);
    if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(priceText) || !Number.isFinite(price) || price < 0) {
      issues.push({ field: "price", message: "Active products need a valid price — use 0 to make it free." });
    }
    if (!validDeliveryUrl(String(product.deliveryLink ?? ""))) {
      issues.push({ field: "deliveryLink", message: "Active products need a valid HTTPS delivery link before they can be sold." });
    }
  }
  return issues;
}

function inputValue(form: HTMLFormElement, name: string): string {
  const control = form.elements.namedItem(name);
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
    return control.value.trim();
  }
  return "";
}

function checkboxValue(form: HTMLFormElement, name: string): boolean {
  const control = form.elements.namedItem(name);
  return control instanceof HTMLInputElement && control.checked;
}

function scalarLike(original: unknown, value: string): string | number {
  if (typeof original === "number") return value ? Number(value) : 0;
  return value;
}

function productFromForm(form: HTMLFormElement, original: Product): Product {
  return {
    ...original,
    name: inputValue(form, "name"),
    category: inputValue(form, "category"),
    price: scalarLike(original.price, inputValue(form, "price")),
    desc: inputValue(form, "desc"),
    tags: inputValue(form, "tags").split(",").map((tag) => tag.trim()).filter(Boolean),
    includes: inputValue(form, "includes").split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
    badge: inputValue(form, "badge"),
    ptype: inputValue(form, "ptype"),
    deliveryLink: inputValue(form, "deliveryLink"),
    origPrice: scalarLike(original.origPrice, inputValue(form, "origPrice")),
    sold: scalarLike(original.sold, inputValue(form, "sold")),
    active: checkboxValue(form, "active"),
    stripeLink: inputValue(form, "stripeLink"),
  };
}

function productIndexFromElement(element: Element): number | null {
  const holder = element.closest<HTMLElement>("[data-product-index]");
  if (!holder) return null;
  const index = Number(holder.dataset.productIndex);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function wallItems(store: StoreData): unknown[] {
  if (Array.isArray(store.gallery)) return store.gallery;
  if (Array.isArray(store.wall)) return store.wall;
  if (isRecord(store.wall) && Array.isArray(store.wall.items)) return store.wall.items;
  return [];
}

function setWallItems(store: StoreData, items: unknown[]): void {
  if (Array.isArray(store.gallery) || store.gallery !== undefined) {
    store.gallery = items;
    return;
  }
  if (Array.isArray(store.wall)) {
    store.wall = items;
    return;
  }
  if (isRecord(store.wall) && Array.isArray(store.wall.items)) {
    store.wall = { ...store.wall, items };
    return;
  }
  store.gallery = items;
}

function wallItemUrl(item: unknown): string {
  if (typeof item === "string") return item;
  return isRecord(item) && typeof item.url === "string" ? item.url : "";
}

function formatDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatMoney(amountMinor: unknown, currency: unknown): string {
  const amount = typeof amountMinor === "number" && Number.isFinite(amountMinor) ? amountMinor : 0;
  const code = typeof currency === "string" && /^[a-z]{3}$/i.test(currency) ? currency.toUpperCase() : "GBP";
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: code }).format(amount / 100);
  } catch {
    return `${code} ${(amount / 100).toFixed(2)}`;
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(`Could not read ${file.name}.`));
        return;
      }
      const comma = reader.result.indexOf(",");
      resolve(comma >= 0 ? reader.result.slice(comma + 1) : reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function uploadFile(file: File): Promise<UploadResponse> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`${file.name} is larger than the 50 MB upload limit.`);
  }
  const contentType = file.type || "application/octet-stream";
  if (file.size <= DIRECT_UPLOAD_BYTES) {
    const dataBase64 = await fileToBase64(file);
    const response = await adminApi.upload(file.name, contentType, dataBase64);
    return normaliseUploadResponse(response);
  }

  const ticket = await adminApi.createSignedUpload(file.name, contentType, file.size);
  if (!ticket || ticket.method !== "PUT" || typeof ticket.signedUrl !== "string" || !ticket.signedUrl) {
    throw new Error("The media service did not return a valid upload URL.");
  }
  if (typeof ticket.maxBytes === "number" && file.size > ticket.maxBytes) {
    throw new Error(`${file.name} is larger than the server upload limit.`);
  }
  const upload = await fetch(ticket.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": ticket.mimeType || contentType },
    body: file,
  });
  if (!upload.ok) {
    throw new Error(`The upload of ${file.name} failed (${upload.status}).`);
  }
  const url = ticket.publicUrl || ticket.url;
  if (!url) throw new Error("The upload completed without a public file URL.");
  return {
    path: ticket.path,
    url,
    mimeType: ticket.mimeType || contentType,
    size: file.size,
  };
}

function humaniseKey(key: string): string {
  const labels: Record<string, string> = {
    allLabel: "All-products tab label",
    flogo: "Footer logo",
    fcopy: "Copyright line",
    confh: "Purchase confirmation heading",
    confp: "Purchase confirmation message",
    confsteps: "Purchase confirmation steps",
    sub: "Hero subtitle",
  };
  if (labels[key]) return labels[key];
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function contentKind(key: string, value: unknown): "string" | "number" | "boolean" | "string-array" | "json" {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return "string-array";
  if ((key === "strip" || key === "confsteps" || key === "socials" || key === "reviews") && (value === undefined || value === null)) return "string-array";
  if (isRecord(value) || Array.isArray(value)) return "json";
  return "string";
}

function contentFieldKeys(content: JsonRecord): string[] {
  const preferred = [
    "logo", "pill", "eyebrow", "title", "sub", "announce", "allLabel", "strip",
    "flogo", "fcopy", "confh", "confp", "confsteps",
    "contactEmail", "contactPhone", "socials", "reviews",
  ];
  const keys = new Set([...preferred, ...Object.keys(content)]);
  return [...keys];
}

function renderContentField(key: string, value: unknown, index: number): string {
  const id = `admin-content-${index}`;
  const label = escapeHtml(humaniseKey(key));
  const kind = contentKind(key, value);
  const data = `data-content-key="${escapeHtml(key)}" data-content-kind="${kind}"`;
  const error = `<span class="admin-field-error" data-content-error="${escapeHtml(key)}"></span>`;

  if (kind === "boolean") {
    return `<div class="field admin-field admin-checkbox-field">
      <label for="${id}"><input id="${id}" name="content-${index}" type="checkbox" ${data} ${value === true ? "checked" : ""}> ${label}</label>
      ${error}
    </div>`;
  }

  if (kind === "number") {
    return `<div class="field admin-field">
      <label for="${id}">${label}</label>
      <input class="field" id="${id}" name="content-${index}" type="number" ${data} value="${escapeHtml(value)}">
      ${error}
    </div>`;
  }

  if (kind === "string-array" || kind === "json") {
    const text = kind === "string-array"
      ? (Array.isArray(value) ? value.filter((item) => typeof item === "string").join("\n") : "")
      : JSON.stringify(value ?? {}, null, 2);
    const hint = key === "socials"
      ? `<small>One per line, formatted as Label|https://link — e.g. Instagram|https://instagram.com/yourhandle</small>`
      : key === "reviews"
        ? `<small>One per line: Name|Review text|https://image-link (image optional). Shows on The Wall.</small>`
        : kind === "string-array" ? `<small>One item per line.</small>` : `<small>Advanced JSON field. Keep the braces and quotes valid.</small>`;
    return `<div class="field admin-field">
      <label for="${id}">${label}</label>
      <textarea class="field" id="${id}" name="content-${index}" rows="${kind === "json" ? "8" : "4"}" ${data}>${escapeHtml(text)}</textarea>
      ${hint}${error}
    </div>`;
  }

  const useTextarea = /title|sub|announce|copy|message|description|confp/i.test(key) || String(value ?? "").length > 100;
  return `<div class="field admin-field">
    <label for="${id}">${label}</label>
    ${useTextarea
      ? `<textarea class="field" id="${id}" name="content-${index}" rows="4" ${data}>${escapeHtml(value)}</textarea>`
      : `<input class="field" id="${id}" name="content-${index}" type="text" ${data} value="${escapeHtml(value)}">`}
    ${error}
  </div>`;
}

function renderMediaPreview(item: MediaItem, index: number): string {
  const url = safeAssetUrl(item.url);
  let preview: string;
  if (!url) {
    preview = `<div class="admin-preview admin-preview-missing">Preview unavailable</div>`;
  } else if (item.type === "video") {
    preview = `<video class="admin-preview" src="${escapeHtml(url)}" controls muted playsinline preload="metadata"></video>`;
  } else if (item.type === "document") {
    preview = `<a class="admin-preview admin-preview-document" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open document</a>`;
  } else {
    preview = `<img class="admin-preview" src="${escapeHtml(url)}" alt="" loading="lazy">`;
  }
  return `<div class="admin-wall-item" data-media-index="${index}">
    ${preview}
    <div class="admin-actions" aria-label="Media item ${index + 1} actions">
      <button class="button" type="button" data-action="media-up" ${index === 0 ? "disabled" : ""} aria-label="Move media item up">↑</button>
      <button class="button" type="button" data-action="media-down" aria-label="Move media item down">↓</button>
      <button class="button button-danger" type="button" data-action="media-remove" aria-label="Remove media item">Remove</button>
    </div>
  </div>`;
}

function renderProductCard(product: Product, index: number): string {
  const issues = productIssues(product);
  const issueFor = (field: ProductIssue["field"]): string => issues.find((issue) => issue.field === field)?.message ?? "";
  const nameIssue = issueFor("name");
  const priceIssue = issueFor("price");
  const deliveryIssue = issueFor("deliveryLink");
  const currentType = String(product.ptype ?? "Playbook");
  const knownTypes = ["Playbook", "System", "Tool", "Template", "Bundle", "File"];
  const types = knownTypes.includes(currentType) ? knownTypes : [currentType, ...knownTypes];
  const media = productMedia(product);

  return `<form class="panel admin-card admin-form" data-admin-form="product" data-product-index="${index}" novalidate>
    <div class="admin-item-main">
      <div>
        <p class="admin-kicker">Product ${index + 1}</p>
        <h3>${escapeHtml(product.name || "Untitled product")}</h3>
      </div>
      <span class="admin-validity ${issues.length ? "is-error" : "is-ok"}" data-product-validation role="status">
        ${issues.length ? `${issues.length} issue${issues.length === 1 ? "" : "s"} to fix` : "Ready to sell"}
      </span>
    </div>

    <div class="admin-error" data-product-summary ${issues.length ? "" : "hidden"} role="alert">
      ${issues.length ? escapeHtml(issues.map((issue) => issue.message).join(" ")) : ""}
    </div>

    <div class="admin-form-grid">
      <div class="field admin-field admin-field-wide">
        <label for="product-${index}-name">Name</label>
        <input class="field" id="product-${index}-name" name="name" type="text" required value="${escapeHtml(product.name)}" aria-invalid="${nameIssue ? "true" : "false"}" aria-describedby="product-${index}-name-error">
        <span class="admin-field-error" id="product-${index}-name-error" data-error-for="name">${escapeHtml(nameIssue)}</span>
      </div>
      <div class="field admin-field">
        <label for="product-${index}-category">Category</label>
        <input class="field" id="product-${index}-category" name="category" type="text" value="${escapeHtml(product.category)}">
      </div>
      <div class="field admin-field">
        <label for="product-${index}-badge">Badge</label>
        <input class="field" id="product-${index}-badge" name="badge" type="text" value="${escapeHtml(product.badge)}" placeholder="Optional">
      </div>
      <div class="field admin-field">
        <label for="product-${index}-ptype">Type</label>
        <select class="field" id="product-${index}-ptype" name="ptype">
          ${types.map((type) => `<option value="${escapeHtml(type)}" ${type === currentType ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}
        </select>
      </div>
      <div class="field admin-field">
        <label for="product-${index}-price">Price (£)</label>
        <input class="field" id="product-${index}-price" name="price" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(product.price)}" aria-invalid="${priceIssue ? "true" : "false"}" aria-describedby="product-${index}-price-error">
        <span class="admin-field-error" id="product-${index}-price-error" data-error-for="price">${escapeHtml(priceIssue)}</span>
      </div>
      <div class="field admin-field">
        <label for="product-${index}-orig-price">Original price (£)</label>
        <input class="field" id="product-${index}-orig-price" name="origPrice" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(product.origPrice)}" placeholder="Optional crossed-out price">
      </div>
      <div class="field admin-field">
        <label for="product-${index}-sold">Sold count</label>
        <input class="field" id="product-${index}-sold" name="sold" type="number" min="0" step="1" inputmode="numeric" value="${escapeHtml(product.sold)}" placeholder="Optional">
      </div>
      <div class="field admin-field admin-checkbox-field">
        <label for="product-${index}-active"><input id="product-${index}-active" name="active" type="checkbox" ${product.active !== false ? "checked" : ""}> Visible and active</label>
        <small>Inactive products are kept as drafts.</small>
      </div>
      <div class="field admin-field admin-field-wide">
        <label for="product-${index}-desc">Description</label>
        <textarea class="field" id="product-${index}-desc" name="desc" rows="5">${escapeHtml(product.desc)}</textarea>
      </div>
      <div class="field admin-field admin-field-wide">
        <label for="product-${index}-tags">Tags</label>
        <input class="field" id="product-${index}-tags" name="tags" type="text" value="${escapeHtml((product.tags ?? []).join(", "))}">
        <small>Separate tags with commas.</small>
      </div>
      <div class="field admin-field admin-field-wide">
        <label for="product-${index}-includes">What’s included</label>
        <textarea class="field" id="product-${index}-includes" name="includes" rows="5">${escapeHtml((product.includes ?? []).join("\n"))}</textarea>
        <small>One item per line.</small>
      </div>
      <div class="field admin-field admin-field-wide">
        <label for="product-${index}-stripe">Legacy Stripe payment link (not used)</label>
        <input class="field" id="product-${index}-stripe" name="stripeLink" type="url" value="${escapeHtml(product.stripeLink)}" placeholder="https://buy.stripe.com/…">
        <small>Kept only for compatibility with existing data. Secure checkout is always created server-side from the live product price.</small>
      </div>
      <div class="field admin-field admin-field-wide">
        <label for="product-${index}-delivery">Delivery link</label>
        <input class="field" id="product-${index}-delivery" name="deliveryLink" type="url" value="${escapeHtml(product.deliveryLink)}" placeholder="https://…" aria-invalid="${deliveryIssue ? "true" : "false"}" aria-describedby="product-${index}-delivery-error">
        <span class="admin-field-error" id="product-${index}-delivery-error" data-error-for="deliveryLink">${escapeHtml(deliveryIssue)}</span>
        <small>Use an existing protected delivery URL. Storefront media uploads are public and must not contain paid files.</small>
      </div>
    </div>

    <fieldset class="admin-media panel">
      <legend>Product media</legend>
      <p>Images and video appear in this order. The first image is used as the cover.</p>
      <div class="admin-wall-grid admin-media-list" data-product-index="${index}">
        ${media.length ? media.map(renderMediaPreview).join("") : `<p class="admin-empty">No media yet.</p>`}
      </div>
      <div class="admin-upload">
        <label for="product-${index}-media-files">Upload images or video</label>
        <input id="product-${index}-media-files" type="file" accept="image/*,video/*" multiple data-action="upload-product-media">
        <small>Maximum 50 MB per file.</small>
      </div>
      <div class="admin-form-grid admin-media-url-row">
        <div class="field admin-field">
          <label for="product-${index}-media-url">Add media URL</label>
          <input class="field" id="product-${index}-media-url" name="mediaUrl" type="url" placeholder="https://…">
        </div>
        <button class="button" type="button" data-action="add-product-media-url">Add URL</button>
      </div>
    </fieldset>

    <div class="admin-actions">
      <button class="button button-primary" type="submit">Save product</button>
      <button class="button button-danger" type="button" data-action="delete-product">Delete product</button>
    </div>
  </form>`;
}

function renderWallItem(item: unknown, index: number, count: number): string {
  const rawUrl = wallItemUrl(item);
  const url = safeAssetUrl(rawUrl);
  return `<div class="panel admin-wall-item" data-wall-index="${index}">
    ${url
      ? `<img class="admin-preview" src="${escapeHtml(url)}" alt="Wall image ${index + 1}" loading="lazy">`
      : `<div class="admin-preview admin-preview-missing">Preview unavailable</div>`}
    <p class="admin-truncate" title="${escapeHtml(rawUrl)}">${escapeHtml(rawUrl || "Missing URL")}</p>
    <div class="admin-actions" aria-label="Wall image ${index + 1} actions">
      <button class="button" type="button" data-action="wall-up" ${index === 0 ? "disabled" : ""} aria-label="Move wall image up">↑</button>
      <button class="button" type="button" data-action="wall-down" ${index === count - 1 ? "disabled" : ""} aria-label="Move wall image down">↓</button>
      <button class="button button-danger" type="button" data-action="wall-remove">Remove</button>
    </div>
  </div>`;
}

function orderStatusClass(status: unknown): string {
  return String(status ?? "unknown").toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

function isPaidOrder(order: Order): boolean {
  return /^(paid|complete|completed|succeeded|delivered)$/i.test(String(order.status ?? ""));
}

function renderOrdersStats(orders: Order[]): string {
  const paid = orders.filter(isPaidOrder);
  const buyers = new Set(paid.map((order) => String(order.buyerEmail ?? "").toLowerCase()).filter(Boolean));
  const totals = new Map<string, number>();
  for (const order of paid) {
    const currency = typeof order.currency === "string" ? order.currency.toLowerCase() : "gbp";
    totals.set(currency, (totals.get(currency) ?? 0) + (typeof order.amountTotal === "number" ? order.amountTotal : 0));
  }
  const gross = totals.size
    ? [...totals.entries()].map(([currency, amount]) => formatMoney(amount, currency)).join(" + ")
    : formatMoney(0, "gbp");
  return `<div class="admin-stats">
    <div class="panel admin-stat"><strong>${orders.length}</strong><span>Loaded orders</span></div>
    <div class="panel admin-stat"><strong>${paid.length}</strong><span>Paid</span></div>
    <div class="panel admin-stat"><strong>${buyers.size}</strong><span>Customers</span></div>
    <div class="panel admin-stat"><strong>${escapeHtml(gross)}</strong><span>Paid gross</span></div>
  </div>`;
}

function renderOrderRow(order: Order): string {
  const delivery = safeAssetUrl(order.deliveryLink);
  return `<tr>
    <td>${escapeHtml(formatDate(order.createdAt))}</td>
    <td><strong>${escapeHtml(order.productName || "Unknown product")}</strong><br><small>${escapeHtml(order.productId)}</small></td>
    <td>${escapeHtml(order.buyerEmail || "—")}</td>
    <td>${escapeHtml(formatMoney(order.amountTotal, order.currency))}</td>
    <td><span class="admin-order-status is-${escapeHtml(orderStatusClass(order.status))}">${escapeHtml(order.status || "unknown")}</span></td>
    <td>${delivery ? `<a class="button" href="${escapeHtml(delivery)}" target="_blank" rel="noopener noreferrer">Open</a>` : "—"}</td>
  </tr>`;
}

export async function renderAdmin(root: HTMLElement): Promise<void> {
  let session: AdminSession | null = null;
  let store: StoreData | null = null;
  let updatedAt: string | null = null;
  let activeTab: AdminTab = "products";
  let orders: Order[] = [];
  let ordersLoaded = false;
  let ordersLoading = false;
  let ordersError = "";
  let ordersHasMore = false;
  let actionBusy = false;

  root.onclick = (event) => { void handleClick(event); };
  root.onsubmit = (event) => { void handleSubmit(event); };
  root.onchange = (event) => { void handleChange(event); };
  root.oninput = (event) => { handleInput(event); };
  root.onkeydown = (event) => { handleKeydown(event); };

  function toast(message: string, kind: ToastKind = "info"): void {
    let region = root.querySelector<HTMLElement>(".admin-toasts");
    if (!region) {
      region = document.createElement("div");
      region.className = "admin-toasts";
      region.setAttribute("aria-live", "polite");
      root.append(region);
    }
    const item = document.createElement("div");
    item.className = `toast is-${kind}`;
    item.setAttribute("role", kind === "error" ? "alert" : "status");
    item.textContent = message;
    region.append(item);
    window.setTimeout(() => item.remove(), 4500);
  }

  function renderLoading(message: string): void {
    root.innerHTML = `<section class="admin-shell" aria-busy="true">
      <div class="panel admin-loading" role="status">
        <span class="admin-spinner" aria-hidden="true"></span>
        <p>${escapeHtml(message)}</p>
      </div>
      <div class="admin-toasts" aria-live="polite"></div>
    </section>`;
  }

  function renderLogin(error = ""): void {
    root.innerHTML = `<section class="admin-shell admin-login">
      <header class="admin-header">
        <a class="admin-title" href="/" aria-label="Return to ShadowGLB store">SHADOW<span>GLB</span></a>
      </header>
      <main class="admin-main">
        <form class="panel admin-login-card admin-form" data-admin-form="login">
          <p class="admin-kicker">Secure control room</p>
          <h1>Admin sign in</h1>
          <p>Use the Supabase admin account for this store.</p>
          ${error ? `<div class="admin-error" role="alert">${escapeHtml(error)}</div>` : ""}
          <div class="field admin-field">
            <label for="admin-email">Email</label>
            <input class="field" id="admin-email" name="email" type="email" autocomplete="username" inputmode="email" required autofocus>
          </div>
          <div class="field admin-field">
            <label for="admin-password">Password</label>
            <input class="field" id="admin-password" name="password" type="password" autocomplete="current-password" required>
          </div>
          <button class="button button-primary" type="submit">Sign in</button>
        </form>
      </main>
      <div class="admin-toasts" aria-live="polite"></div>
    </section>`;
  }

  function renderProductsPanel(): string {
    if (!store) return "";
    const products = productsFromStore(store);
    const unsafeActiveProducts = products.filter((product) => product.active !== false && productIssues(product).length > 0);
    return `<section class="admin-panel" id="admin-panel-products" role="tabpanel" aria-labelledby="admin-tab-products" tabindex="0">
      <div class="admin-toolbar">
        <div><p class="admin-kicker">Catalogue</p><h2>Products</h2><p>${products.length} product${products.length === 1 ? "" : "s"}</p></div>
        <button class="button button-primary" type="button" data-action="add-product">Add product</button>
      </div>
      ${unsafeActiveProducts.length ? `<div class="admin-error" role="alert"><strong>Action required:</strong> ${unsafeActiveProducts.length} active product${unsafeActiveProducts.length === 1 ? " is" : "s are"} missing a valid price, delivery link, or name. Fix the highlighted fields or make the product inactive.</div>` : ""}
      <div class="admin-list">
        ${products.length ? products.map(renderProductCard).join("") : `<div class="panel admin-empty"><p>No products yet.</p><button class="button button-primary" type="button" data-action="add-product">Create the first product</button></div>`}
      </div>
    </section>`;
  }

  function renderContentPanel(): string {
    if (!store) return "";
    const content = isRecord(store.content) ? store.content : {};
    const keys = contentFieldKeys(content);
    return `<section class="admin-panel" id="admin-panel-content" role="tabpanel" aria-labelledby="admin-tab-content" tabindex="0">
      <div class="admin-toolbar"><div><p class="admin-kicker">Store copy</p><h2>Content</h2><p>Edit the text shown across the storefront and purchase confirmation.</p></div></div>
      <form class="panel admin-form" data-admin-form="content" novalidate>
        <div class="admin-form-grid">
          ${keys.map((key, index) => renderContentField(key, content[key], index)).join("")}
        </div>
        <div class="admin-actions"><button class="button button-primary" type="submit">Save content</button></div>
      </form>
    </section>`;
  }

  function renderWallPanel(): string {
    if (!store) return "";
    const items = wallItems(store);
    return `<section class="admin-panel" id="admin-panel-wall" role="tabpanel" aria-labelledby="admin-tab-wall" tabindex="0">
      <div class="admin-toolbar"><div><p class="admin-kicker">Visual gallery</p><h2>The Wall</h2><p>Add, remove, and set the display order.</p></div></div>
      <div class="panel admin-form">
        <div class="admin-upload">
          <label for="admin-wall-upload">Upload images</label>
          <input id="admin-wall-upload" type="file" accept="image/*" multiple data-action="upload-wall">
          <small>Maximum 50 MB per image.</small>
        </div>
        <form class="admin-form-grid" data-admin-form="wall-url">
          <div class="field admin-field">
            <label for="admin-wall-url">Or add an image URL</label>
            <input class="field" id="admin-wall-url" name="wallUrl" type="url" required placeholder="https://…">
          </div>
          <button class="button" type="submit">Add URL</button>
        </form>
      </div>
      <div class="admin-wall-grid">
        ${items.length ? items.map((item, index) => renderWallItem(item, index, items.length)).join("") : `<div class="panel admin-empty"><p>No Wall images yet.</p></div>`}
      </div>
    </section>`;
  }

  function renderOrdersPanel(): string {
    return `<section class="admin-panel" id="admin-panel-orders" role="tabpanel" aria-labelledby="admin-tab-orders" tabindex="0">
      <div class="admin-toolbar">
        <div><p class="admin-kicker">Sales</p><h2>Orders</h2><p>Server-confirmed checkout and delivery records.</p></div>
        <button class="button" type="button" data-action="refresh-orders" ${ordersLoading ? "disabled" : ""}>Refresh</button>
      </div>
      ${ordersLoading && !orders.length ? `<div class="panel admin-loading" role="status"><span class="admin-spinner" aria-hidden="true"></span><p>Loading orders…</p></div>` : ""}
      ${ordersError ? `<div class="admin-error" role="alert">${escapeHtml(ordersError)} <button class="button" type="button" data-action="refresh-orders">Try again</button></div>` : ""}
      ${orders.length ? `${renderOrdersStats(orders)}
        <div class="panel admin-table-wrap">
          <table class="admin-table">
            <caption class="sr-only">ShadowGLB orders</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">Product</th><th scope="col">Customer</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col">Delivery</th></tr></thead>
            <tbody>${orders.map(renderOrderRow).join("")}</tbody>
          </table>
        </div>
        ${ordersHasMore ? `<div class="admin-actions"><button class="button" type="button" data-action="load-more-orders" ${ordersLoading ? "disabled" : ""}>${ordersLoading ? "Loading…" : "Load more"}</button></div>` : ""}` : (!ordersLoading && !ordersError ? `<div class="panel admin-empty"><p>No orders found.</p></div>` : "")}
    </section>`;
  }

  function renderDashboard(): void {
    if (!session || !store) return;
    const tabs: Array<{ id: AdminTab; label: string }> = [
      { id: "products", label: "Products" },
      { id: "content", label: "Content" },
      { id: "wall", label: "The Wall" },
      { id: "orders", label: "Orders" },
    ];
    const panel = activeTab === "products"
      ? renderProductsPanel()
      : activeTab === "content"
        ? renderContentPanel()
        : activeTab === "wall"
          ? renderWallPanel()
          : renderOrdersPanel();

    root.innerHTML = `<section class="admin-shell">
      <header class="admin-header">
        <a class="admin-title" href="/" aria-label="Return to ShadowGLB store">SHADOW<span>GLB</span> <small>Control</small></a>
        <div class="admin-session"><span>${escapeHtml(session.user.email)}</span><button class="button" type="button" data-action="logout">Log out</button></div>
      </header>
      <main class="admin-main">
        <nav class="admin-tabs" role="tablist" aria-label="Admin sections">
          ${tabs.map((tab) => `<button class="admin-tab" id="admin-tab-${tab.id}" type="button" role="tab" data-action="tab" data-tab="${tab.id}" aria-selected="${activeTab === tab.id ? "true" : "false"}" aria-controls="admin-panel-${tab.id}" tabindex="${activeTab === tab.id ? "0" : "-1"}">${tab.label}</button>`).join("")}
        </nav>
        ${panel}
        <p class="admin-updated">Store version: ${escapeHtml(formatDate(updatedAt))}</p>
      </main>
      <div class="admin-toasts" aria-live="polite" aria-atomic="false"></div>
    </section>`;
  }

  function setBusy(control: HTMLButtonElement | HTMLInputElement | null, busy: boolean, label?: string): () => void {
    const previousDisabled = control?.disabled ?? false;
    const previousText = control instanceof HTMLButtonElement ? control.textContent : null;
    if (control) control.disabled = busy;
    if (busy && label && control instanceof HTMLButtonElement) control.textContent = label;
    actionBusy = busy;
    return () => {
      actionBusy = false;
      if (control?.isConnected) control.disabled = previousDisabled;
      if (control instanceof HTMLButtonElement && control.isConnected && previousText !== null) control.textContent = previousText;
    };
  }

  function actionError(error: unknown, fallback: string): void {
    if (error instanceof AdminApiError && error.status === 409) {
      showConflictBanner();
      toast("Another admin changed the store. Reload the latest version before saving again.", "error");
      return;
    }
    const message = error instanceof Error && error.message ? error.message : fallback;
    toast(message, "error");
  }

  function showConflictBanner(): void {
    const panel = root.querySelector<HTMLElement>(".admin-panel");
    if (!panel || panel.querySelector(".admin-conflict")) return;
    const banner = document.createElement("div");
    banner.className = "admin-error admin-conflict";
    banner.setAttribute("role", "alert");
    const text = document.createElement("span");
    text.textContent = "This store was changed in another admin session. Your edit was not applied.";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.dataset.action = "reload-store";
    button.textContent = "Reload latest store";
    banner.append(text, button);
    panel.prepend(banner);
  }

  async function loadStore(): Promise<void> {
    const response = normaliseStoreResponse(await adminApi.store());
    store = response.data;
    updatedAt = response.updatedAt;
  }

  async function persistStore(nextStore: StoreData): Promise<void> {
    const response = normaliseStoreResponse(await adminApi.saveStore(nextStore, updatedAt));
    store = response.data;
    updatedAt = response.updatedAt;
  }

  async function loadOrders(append: boolean): Promise<void> {
    if (ordersLoading) return;
    ordersLoading = true;
    ordersError = "";
    renderDashboard();
    try {
      const offset = append ? orders.length : 0;
      const response = normaliseOrdersResponse(await adminApi.orders(ORDER_PAGE_SIZE, offset));
      orders = append ? [...orders, ...response.orders] : response.orders;
      ordersLoaded = true;
      ordersHasMore = response.orders.length === response.limit;
    } catch (error) {
      ordersError = error instanceof Error ? error.message : "Orders could not be loaded.";
    } finally {
      ordersLoading = false;
      renderDashboard();
    }
  }

  function productAt(index: number): Product | null {
    if (!store) return null;
    return productsFromStore(store)[index] ?? null;
  }

  function updateProductValidation(form: HTMLFormElement): ProductIssue[] {
    const index = productIndexFromElement(form);
    const original = index === null ? null : productAt(index);
    if (!original) return [];
    const draft = productFromForm(form, original);
    const issues = productIssues(draft);
    const validity = form.querySelector<HTMLElement>("[data-product-validation]");
    if (validity) {
      validity.className = `admin-validity ${issues.length ? "is-error" : "is-ok"}`;
      validity.textContent = issues.length ? `${issues.length} issue${issues.length === 1 ? "" : "s"} to fix` : "Ready to sell";
    }
    const summary = form.querySelector<HTMLElement>("[data-product-summary]");
    if (summary) {
      summary.hidden = issues.length === 0;
      summary.textContent = issues.map((issue) => issue.message).join(" ");
    }
    for (const field of ["name", "price", "deliveryLink"] as const) {
      const issue = issues.find((candidate) => candidate.field === field);
      const control = form.elements.namedItem(field);
      if (control instanceof HTMLInputElement) control.setAttribute("aria-invalid", issue ? "true" : "false");
      const error = form.querySelector<HTMLElement>(`[data-error-for="${field}"]`);
      if (error) error.textContent = issue?.message ?? "";
    }
    return issues;
  }

  function updateMediaList(index: number): void {
    const product = productAt(index);
    const area = root.querySelector<HTMLElement>(`.admin-media-list[data-product-index="${index}"]`);
    if (!product || !area) return;
    const media = productMedia(product);
    area.innerHTML = media.length ? media.map(renderMediaPreview).join("") : `<p class="admin-empty">No media yet.</p>`;
  }

  function handleInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const form = target.closest<HTMLFormElement>('form[data-admin-form="product"]');
    if (form) updateProductValidation(form);
  }

  function handleKeydown(event: KeyboardEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.getAttribute("role") !== "tab") return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const current = tabs.indexOf(target as HTMLButtonElement);
    if (current < 0) return;
    event.preventDefault();
    let next = current;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else next = (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click();
  }

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const formType = form.dataset.adminForm;
    if (!formType) return;
    event.preventDefault();
    if (actionBusy) return;

    if (formType === "login") {
      if (!form.reportValidity()) return;
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      const restore = setBusy(button, true, "Signing in…");
      try {
        session = normaliseSession(await adminApi.login(inputValue(form, "email"), inputValue(form, "password")));
        renderLoading("Loading the store…");
        await loadStore();
        renderDashboard();
        toast("Signed in securely.", "success");
      } catch (error) {
        session = null;
        const message = error instanceof AdminApiError && error.status === 401
          ? "Email or password not recognised."
          : error instanceof Error ? error.message : "Sign in failed.";
        renderLogin(message);
      } finally {
        restore();
      }
      return;
    }

    if (!store) return;

    if (formType === "product") {
      const index = productIndexFromElement(form);
      const original = index === null ? null : productAt(index);
      if (index === null || !original) return;
      const issues = updateProductValidation(form);
      if (!form.reportValidity() || issues.length) {
        const firstInvalid = form.querySelector<HTMLElement>('[aria-invalid="true"], :invalid');
        firstInvalid?.focus();
        toast("Fix the highlighted product fields before saving.", "error");
        return;
      }
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      const restore = setBusy(button, true, "Saving…");
      try {
        const next = clone(store);
        const nextProducts = productsFromStore(next);
        nextProducts[index] = productFromForm(form, nextProducts[index]);
        next.products = nextProducts;
        await persistStore(next);
        renderDashboard();
        toast("Product saved.", "success");
      } catch (error) {
        actionError(error, "The product could not be saved.");
      } finally {
        restore();
      }
      return;
    }

    if (formType === "content") {
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      const controls = [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-content-key]")];
      const nextContent = clone(isRecord(store.content) ? store.content : {});
      let invalidControl: HTMLInputElement | HTMLTextAreaElement | null = null;
      for (const control of controls) {
        const key = control.dataset.contentKey;
        const kind = control.dataset.contentKind;
        if (!key || !kind) continue;
        const errorSlot = form.querySelector<HTMLElement>(`[data-content-error="${key}"]`);
        control.setAttribute("aria-invalid", "false");
        if (errorSlot) errorSlot.textContent = "";
        try {
          if (kind === "boolean" && control instanceof HTMLInputElement) nextContent[key] = control.checked;
          else if (kind === "number") nextContent[key] = Number(control.value);
          else if (kind === "string-array") nextContent[key] = control.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
          else if (kind === "json") nextContent[key] = JSON.parse(control.value) as unknown;
          else nextContent[key] = control.value;
        } catch {
          control.setAttribute("aria-invalid", "true");
          if (errorSlot) errorSlot.textContent = "Enter valid JSON before saving.";
          invalidControl ??= control;
        }
      }
      if (invalidControl) {
        invalidControl.focus();
        toast("Fix the highlighted content field.", "error");
        return;
      }
      const restore = setBusy(button, true, "Saving…");
      try {
        const next = clone(store);
        next.content = nextContent;
        await persistStore(next);
        renderDashboard();
        toast("Store content saved.", "success");
      } catch (error) {
        actionError(error, "Content could not be saved.");
      } finally {
        restore();
      }
      return;
    }

    if (formType === "wall-url") {
      if (!form.reportValidity()) return;
      const url = inputValue(form, "wallUrl");
      if (!validRemoteUrl(url)) {
        toast("Enter a valid http or https image URL.", "error");
        return;
      }
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      const restore = setBusy(button, true, "Adding…");
      try {
        const next = clone(store);
        setWallItems(next, [...wallItems(next), { url }]);
        await persistStore(next);
        renderDashboard();
        toast("Image added to The Wall.", "success");
      } catch (error) {
        actionError(error, "The image could not be added.");
      } finally {
        restore();
      }
    }
  }

  async function handleChange(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "file" || !input.dataset.action || actionBusy || !store) return;
    const files = [...(input.files ?? [])];
    if (!files.length) return;
    const restore = setBusy(input, true);

    try {
      if (input.dataset.action === "upload-product-media") {
        const index = productIndexFromElement(input);
        const product = index === null ? null : productAt(index);
        if (index === null || !product) return;
        toast(`Uploading ${files.length} file${files.length === 1 ? "" : "s"}…`);
        const uploaded = await Promise.all(files.map(uploadFile));
        const media = productMedia(product);
        media.push(...uploaded.map((item) => ({
          url: item.url,
          type: mediaTypeFromMime(item.mimeType),
          path: item.path,
          mimeType: item.mimeType,
          size: item.size,
        })));
        setProductMedia(product, media);
        updateMediaList(index);
        toast("Media uploaded. Save the product to publish the changes.", "success");
        return;
      }

      if (input.dataset.action === "upload-wall") {
        toast(`Uploading ${files.length} image${files.length === 1 ? "" : "s"}…`);
        const uploaded = await Promise.all(files.map(uploadFile));
        const next = clone(store);
        const additions = uploaded.map((item) => ({ url: item.url, path: item.path, mimeType: item.mimeType, size: item.size }));
        setWallItems(next, [...wallItems(next), ...additions]);
        await persistStore(next);
        renderDashboard();
        toast(`${uploaded.length} image${uploaded.length === 1 ? "" : "s"} added to The Wall.`, "success");
      }
    } catch (error) {
      actionError(error, "The upload failed.");
    } finally {
      input.value = "";
      restore();
    }
  }

  async function handleClick(event: MouseEvent): Promise<void> {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest<HTMLElement>("[data-action]");
    if (!control) return;
    const action = control.dataset.action;
    if (!action || action.startsWith("upload-")) return;

    if (action === "tab") {
      const tab = control.dataset.tab;
      if (tab !== "products" && tab !== "content" && tab !== "wall" && tab !== "orders") return;
      activeTab = tab;
      renderDashboard();
      root.querySelector<HTMLElement>(`#admin-tab-${tab}`)?.focus();
      if (tab === "orders" && !ordersLoaded && !ordersLoading) await loadOrders(false);
      return;
    }

    if (actionBusy) return;

    if (action === "logout") {
      const button = control instanceof HTMLButtonElement ? control : null;
      const restore = setBusy(button, true, "Logging out…");
      try {
        await adminApi.logout();
        session = null;
        store = null;
        updatedAt = null;
        orders = [];
        ordersLoaded = false;
        renderLogin();
      } catch (error) {
        actionError(error, "Log out failed.");
      } finally {
        restore();
      }
      return;
    }

    if (action === "reload-store") {
      if (!window.confirm("Reload the latest store? Unsaved form changes on this screen will be discarded.")) return;
      const button = control instanceof HTMLButtonElement ? control : null;
      const restore = setBusy(button, true, "Reloading…");
      try {
        await loadStore();
        renderDashboard();
        toast("Latest store loaded.", "success");
      } catch (error) {
        actionError(error, "The latest store could not be loaded.");
      } finally {
        restore();
      }
      return;
    }

    if (!store) return;

    if (action === "add-product") {
      const button = control instanceof HTMLButtonElement ? control : null;
      const restore = setBusy(button, true, "Adding…");
      try {
        const next = clone(store);
        const products = productsFromStore(next);
        const numericIds = products.map((product) => Number(product.id)).filter((id) => Number.isFinite(id));
        const id = numericIds.length ? Math.max(...numericIds) + 1 : 1;
        products.push({
          id,
          name: "New product",
          category: "",
          price: "",
          desc: "",
          tags: [],
          includes: [],
          badge: "",
          ptype: "Playbook",
          media: [],
          imageUrl: "",
          deliveryLink: "",
          origPrice: "",
          sold: "",
          active: false,
          stripeLink: "",
        });
        next.products = products;
        await persistStore(next);
        renderDashboard();
        root.querySelector<HTMLElement>(`[data-product-index="${products.length - 1}"] input[name="name"]`)?.focus();
        toast("Draft product added.", "success");
      } catch (error) {
        actionError(error, "The product could not be added.");
      } finally {
        restore();
      }
      return;
    }

    if (action === "delete-product") {
      const index = productIndexFromElement(control);
      const product = index === null ? null : productAt(index);
      if (index === null || !product) return;
      if (!window.confirm(`Delete “${product.name || "Untitled product"}”? This cannot be undone.`)) return;
      const button = control instanceof HTMLButtonElement ? control : null;
      const restore = setBusy(button, true, "Deleting…");
      try {
        const next = clone(store);
        const products = productsFromStore(next);
        products.splice(index, 1);
        next.products = products;
        await persistStore(next);
        renderDashboard();
        toast("Product deleted.", "success");
      } catch (error) {
        actionError(error, "The product could not be deleted.");
      } finally {
        restore();
      }
      return;
    }

    if (action === "add-product-media-url") {
      const index = productIndexFromElement(control);
      const product = index === null ? null : productAt(index);
      const form = control.closest<HTMLFormElement>('form[data-admin-form="product"]');
      const input = form?.elements.namedItem("mediaUrl");
      if (index === null || !product || !(input instanceof HTMLInputElement)) return;
      const url = input.value.trim();
      if (!validRemoteUrl(url)) {
        input.focus();
        toast("Enter a valid http or https media URL.", "error");
        return;
      }
      const media = productMedia(product);
      media.push({ url, type: mediaTypeFromUrl(url) });
      setProductMedia(product, media);
      input.value = "";
      updateMediaList(index);
      toast("Media added. Save the product to publish the changes.", "success");
      return;
    }

    if (action === "media-up" || action === "media-down" || action === "media-remove") {
      const index = productIndexFromElement(control);
      const product = index === null ? null : productAt(index);
      const holder = control.closest<HTMLElement>("[data-media-index]");
      const mediaIndex = holder ? Number(holder.dataset.mediaIndex) : -1;
      if (index === null || !product || !Number.isInteger(mediaIndex) || mediaIndex < 0) return;
      const media = productMedia(product);
      if (action === "media-remove") {
        media.splice(mediaIndex, 1);
      } else {
        const swapWith = mediaIndex + (action === "media-up" ? -1 : 1);
        if (swapWith < 0 || swapWith >= media.length) return;
        [media[mediaIndex], media[swapWith]] = [media[swapWith], media[mediaIndex]];
      }
      setProductMedia(product, media);
      updateMediaList(index);
      toast("Media order updated. Save the product to publish the changes.");
      return;
    }

    if (action === "wall-up" || action === "wall-down" || action === "wall-remove") {
      const holder = control.closest<HTMLElement>("[data-wall-index]");
      const index = holder ? Number(holder.dataset.wallIndex) : -1;
      if (!Number.isInteger(index) || index < 0) return;
      if (action === "wall-remove" && !window.confirm("Remove this image from The Wall?")) return;
      const button = control instanceof HTMLButtonElement ? control : null;
      const restore = setBusy(button, true, action === "wall-remove" ? "Removing…" : "Moving…");
      try {
        const next = clone(store);
        const items = [...wallItems(next)];
        if (action === "wall-remove") {
          items.splice(index, 1);
        } else {
          const swapWith = index + (action === "wall-up" ? -1 : 1);
          if (swapWith < 0 || swapWith >= items.length) return;
          [items[index], items[swapWith]] = [items[swapWith], items[index]];
        }
        setWallItems(next, items);
        await persistStore(next);
        renderDashboard();
        toast(action === "wall-remove" ? "Wall image removed." : "Wall order updated.", "success");
      } catch (error) {
        actionError(error, "The Wall could not be updated.");
      } finally {
        restore();
      }
      return;
    }

    if (action === "refresh-orders") {
      await loadOrders(false);
      return;
    }

    if (action === "load-more-orders") {
      await loadOrders(true);
    }
  }

  renderLoading("Checking your admin session…");
  try {
    session = normaliseSession(await adminApi.session());
    renderLoading("Loading the store…");
    await loadStore();
    renderDashboard();
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) {
      renderLogin();
    } else {
      const message = error instanceof Error ? error.message : "The admin area could not be loaded.";
      renderLogin(message);
    }
  }
}
