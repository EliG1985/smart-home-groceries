import express from 'express';
import inventoryRouter from './routes/inventory';
import shoppingListRouter from './routes/shoppingList';

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/inventory', inventoryRouter);
app.use('/api/shopping-list', shoppingListRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend API running on port ${PORT}`);
});
