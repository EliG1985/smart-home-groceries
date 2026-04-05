import { runPriceIngestion } from '../utils/priceIngestion';

type ParsedArgs = {
  sourceUrl?: string;
  chainId?: string;
  dryRun: boolean;
  maxRows?: number;
};

const parseArgs = (argv: string[]): ParsedArgs => {
  const parsed: ParsedArgs = {
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }

    if (arg.startsWith('--source=')) {
      parsed.sourceUrl = arg.slice('--source='.length);
      continue;
    }

    if (arg.startsWith('--chain=')) {
      parsed.chainId = arg.slice('--chain='.length);
      continue;
    }

    if (arg.startsWith('--max-rows=')) {
      const raw = Number(arg.slice('--max-rows='.length));
      if (Number.isInteger(raw) && raw > 0) {
        parsed.maxRows = raw;
      }
      continue;
    }
  }

  return parsed;
};

const printUsage = (): void => {
  console.log('Usage: npm run ingest:prices -- --source=<url> [--chain=<chain-id>] [--max-rows=1000] [--dry-run]');
  console.log('Fallback env var: PRICE_INGESTION_SOURCE_URL');
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const sourceUrl = args.sourceUrl || process.env.PRICE_INGESTION_SOURCE_URL;

  if (!sourceUrl) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const result = await runPriceIngestion({
    sourceUrl,
    chainId: args.chainId,
    dryRun: args.dryRun,
    maxRows: args.maxRows,
  });

  console.log('[price-ingestion] completed');
  console.log(JSON.stringify(result, null, 2));
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('[price-ingestion] failed:', message);
  process.exitCode = 1;
});
