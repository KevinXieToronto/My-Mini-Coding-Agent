import { createProgram } from '#cli/commands';

async function main(): Promise<void> {
  const program = createProgram();
  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
