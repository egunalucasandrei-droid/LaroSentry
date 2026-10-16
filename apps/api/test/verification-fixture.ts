import type request from 'supertest';
import sharp from 'sharp';
export async function verificationFixture(
  post: (path: string, body: object) => PromiseLike<request.Response>,
  data: object,
) {
  const draft = await post('/onboarding/drafts', {});
  if (draft.status !== 201) throw new Error(JSON.stringify(draft.body));
  const id = draft.body.id as string;
  const save = await post(`/onboarding/drafts/${id}`, {
    data: { ...data, facilityPhone: '+639171234567' },
    relationship: 'OWNER',
    idType: 'Passport',
  });
  if (save.status !== 201) throw new Error(JSON.stringify(save.body));
  const base64 = (
    await sharp({ create: { width: 32, height: 32, channels: 3, background: '#eeeeee' } })
      .png()
      .toBuffer()
  ).toString('base64');
  for (const kind of ['IDENTITY', 'SUPPORT', 'PHOTO']) {
    const r = await post(`/onboarding/drafts/${id}/documents`, { kind, base64 });
    if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  }
  return post('/facility-applications', { draftId: id });
}
