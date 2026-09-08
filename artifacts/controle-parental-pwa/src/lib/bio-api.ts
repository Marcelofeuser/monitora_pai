// BIO (pedido do Marcelo, 08/09): foto + telefone/e-mail/redes sociais,
// preenchíveis pelo próprio dono da conta -- Responsável, Criança e
// Contato. Um arquivo só pros 3 porque o formato é idêntico (ver
// routes/me.ts no backend) -- só muda o jeito de autenticar.
const API_URL = import.meta.env.VITE_API_URL ?? '';

export type SocialLinks = {
  instagram?: string;
  whatsapp?: string;
  other?: string;
};

export type BioProfile = {
  id: string;
  name: string;
  photoUrl: string | null;
  phone: string | null;
  email: string | null;
  socialLinks: SocialLinks | null;
};

export type UpdateBioInput = {
  name?: string;
  phone?: string | null;
  email?: string | null;
  socialLinks?: SocialLinks | null;
};

async function handle<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? fallback);
  }
  return res.json();
}

// --- Responsável (Bearer do Clerk, mesmo padrão de me-api.ts) ---

export async function fetchParentBio(authToken: string | null): Promise<BioProfile & { relationship: string | null }> {
  const res = await fetch(`${API_URL}/api/me`, {
    headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
  });
  return handle(res, `fetch_parent_bio_failed_${res.status}`);
}

// Responsável não edita o próprio "name" por aqui -- é sincronizado com o
// Clerk a cada leitura (ver lib/parentUser.ts no backend); quem quiser
// trocar, troca na conta.
export async function updateParentBio(
  input: Omit<UpdateBioInput, 'name'>,
  authToken: string | null,
): Promise<BioProfile> {
  const res = await fetch(`${API_URL}/api/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    body: JSON.stringify(input),
  });
  return handle(res, `update_parent_bio_failed_${res.status}`);
}

export async function uploadParentBioPhoto(file: File, authToken: string | null): Promise<{ photoUrl: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/api/me/photo`, {
    method: 'POST',
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    body: form,
  });
  return handle(res, `upload_parent_bio_photo_failed_${res.status}`);
}

// --- Criança (X-Child-Token) ---

function childHeaders(deviceToken: string): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-Child-Token': deviceToken };
}

export async function fetchChildBio(deviceToken: string): Promise<BioProfile> {
  const res = await fetch(`${API_URL}/api/child/me`, { headers: childHeaders(deviceToken) });
  return handle(res, `fetch_child_bio_failed_${res.status}`);
}

export async function updateChildBio(input: UpdateBioInput, deviceToken: string): Promise<BioProfile> {
  const res = await fetch(`${API_URL}/api/child/me`, {
    method: 'PATCH',
    headers: childHeaders(deviceToken),
    body: JSON.stringify(input),
  });
  return handle(res, `update_child_bio_failed_${res.status}`);
}

export async function uploadChildBioPhoto(file: File, deviceToken: string): Promise<{ photoUrl: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/api/child/me/photo`, {
    method: 'POST',
    headers: { 'X-Child-Token': deviceToken },
    body: form,
  });
  return handle(res, `upload_child_bio_photo_failed_${res.status}`);
}

// --- Contato (X-Contact-Token) ---

function contactHeaders(deviceToken: string): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-Contact-Token': deviceToken };
}

export async function fetchContactBio(deviceToken: string): Promise<BioProfile> {
  const res = await fetch(`${API_URL}/api/contact/me`, { headers: contactHeaders(deviceToken) });
  return handle(res, `fetch_contact_bio_failed_${res.status}`);
}

export async function updateContactBio(input: UpdateBioInput, deviceToken: string): Promise<BioProfile> {
  const res = await fetch(`${API_URL}/api/contact/me`, {
    method: 'PATCH',
    headers: contactHeaders(deviceToken),
    body: JSON.stringify(input),
  });
  return handle(res, `update_contact_bio_failed_${res.status}`);
}

export async function uploadContactBioPhoto(file: File, deviceToken: string): Promise<{ photoUrl: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/api/contact/me/photo`, {
    method: 'POST',
    headers: { 'X-Contact-Token': deviceToken },
    body: form,
  });
  return handle(res, `upload_contact_bio_photo_failed_${res.status}`);
}
