import 'dotenv/config';
import express from 'express';
import authRouter from './routes/auth';
import barcodeRouter from './routes/barcode';
import collaborationRouter from './routes/collaboration';
import inventoryRouter from './routes/inventory';
import publicInviteRouter from './routes/publicInvite';
import shoppingListRouter from './routes/shoppingList';
import storeRouter from './routes/store';

export const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/', publicInviteRouter);
app.use('/auth', authRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/shopping-list', shoppingListRouter);
app.use('/api/barcode', barcodeRouter);
app.use('/api/store', storeRouter);
app.use('/api/collaboration', collaborationRouter);

if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Backend API running on port ${PORT}`);
  });
}
