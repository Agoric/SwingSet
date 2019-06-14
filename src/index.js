export {
  loadBasedir,
  buildVatController,
  useStorageInBasedir,
} from './controller';
export { buildMailboxStateMap, buildMailbox } from './devices/mailbox';

export function getVatTPSourcePath() {
  return require.resolve('./vat-tp/vattp');
}
