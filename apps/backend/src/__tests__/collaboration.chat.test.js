const maybeSingleQueue = [];
const singleQueue = [];
const writeQueue = [];

const makeBuilder = () => {
  const target = {};
  const builder = new Proxy(target, {
    get: (_obj, prop) => {
      if (prop === 'maybeSingle') {
        return async () => maybeSingleQueue.shift() ?? { data: null, error: null };
      }

      if (prop === 'single') {
        return async () => singleQueue.shift() ?? { data: null, error: null };
      }

      if (prop === 'then') {
        return (resolve, reject) => {
          const value = writeQueue.shift() ?? { data: null, error: null };
          return Promise.resolve(value).then(resolve, reject);
        };
      }

      return (..._args) => builder;
    },
  });

  return builder;
};

const express = require('express');
const request = require('supertest');
const { supabase } = require('../utils/supabaseClient');
const collaborationRouter = require('../routes/collaboration').default;

const mockFrom = jest.spyOn(supabase, 'from').mockImplementation(() => makeBuilder());
jest.spyOn(supabase.auth.admin, 'getUserById').mockResolvedValue({ data: { user: null }, error: null });
jest.spyOn(supabase.auth.admin, 'updateUserById').mockResolvedValue({ data: { user: null }, error: null });

const app = express();
app.use(express.json());
app.use('/api/collaboration', collaborationRouter);

describe('Collaboration chat moderation and family scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation(() => makeBuilder());
    maybeSingleQueue.length = 0;
    singleQueue.length = 0;
    writeQueue.length = 0;
  });

  it('blocks non-sender from editing message', async () => {
    maybeSingleQueue.push({
      data: {
        id: 'msg-1',
        family_id: 'fam-1',
        sender_id: 'sender-1',
        content: 'hello',
        message_type: 'text',
      },
      error: null,
    });

    const response = await request(app)
      .patch('/api/collaboration/chat/messages/msg-1')
      .set('x-family-id', 'fam-1')
      .set('x-user-id', 'someone-else')
      .set('x-user-role', 'editor')
      .send({ content: 'changed' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('allows admin to delete message from same family', async () => {
    maybeSingleQueue.push({
      data: {
        id: 'msg-2',
        family_id: 'fam-2',
        sender_id: 'member-2',
        content: 'hello',
        message_type: 'text',
      },
      error: null,
    });
    writeQueue.push({ error: null });

    const response = await request(app)
      .delete('/api/collaboration/chat/messages/msg-2')
      .set('x-family-id', 'fam-2')
      .set('x-user-id', 'admin-1')
      .set('x-user-role', 'admin');

    expect(response.status).toBe(200);
    expect(response.body.deleted).toBe(true);
  });

  it('returns not found when message is outside requester family scope', async () => {
    maybeSingleQueue.push({ data: null, error: null });

    const response = await request(app)
      .delete('/api/collaboration/chat/messages/msg-404')
      .set('x-family-id', 'fam-a')
      .set('x-user-id', 'admin-a')
      .set('x-user-role', 'admin');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
