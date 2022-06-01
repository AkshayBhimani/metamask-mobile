import React, { useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import Engine from '../../../core/Engine';
import LedgerConfirmationModal from './LedgerConfirmationModal';
import ReusableModal, { ReusableModalRef } from '../ReusableModal';
import { createStyles } from './styles';
import { useAppThemeFromContext, mockTheme } from '../../../util/theme';
import {
  createNavigationDetails,
  useParams,
} from '../../../util/navigation/navUtils';
import Routes from '../../../constants/navigation/Routes';

export interface LedgerMessageSignModalParams {
  messageParams: any;
  onConfirmationComplete: (confirmed: boolean, rawSignature?: any) => void;
  version: any;
  type: any;
  deviceId: any;
}

export const createLedgerMessageSignModalNavDetails =
  createNavigationDetails<LedgerMessageSignModalParams>(
    'LedgerConnectFlow',
    Routes.LEDGER_MESSAGE_SIGN_MODAL,
  );

const LedgerMessageSignModal = () => {
  const modalRef = useRef<ReusableModalRef | null>(null);
  const { messageParams, version, type, deviceId } = useSelector(
    (state: any) => state.modals.ledgerSignMessageActionParams,
  );
  const { KeyringController } = Engine.context as any;
  const { colors } = useAppThemeFromContext() || mockTheme;
  const styles = createStyles(colors);

  const { onConfirmationComplete } = useParams<LedgerMessageSignModalParams>();

  const dismissModal = useCallback(() => modalRef?.current?.dismissModal(), []);

  const executeOnLedger = useCallback(async () => {
    // This requires the user to confirm on the ledger device
    let rawSignature;

    if (type === 'signMessage') {
      rawSignature = await KeyringController.signMessage(messageParams);
    }

    if (type === 'signPersonalMessage') {
      rawSignature = await KeyringController.signPersonalMessage(messageParams);
    }

    if (type === 'signTypedMessage') {
      rawSignature = await KeyringController.signTypedMessage(
        messageParams,
        version,
      );
    }

    onConfirmationComplete(true, rawSignature);
    // dispatch(closeLedgerSignModal());
    dismissModal();
  }, [
    KeyringController,
    dismissModal,
    messageParams,
    onConfirmationComplete,
    type,
    version,
  ]);

  const onRejection = useCallback(() => {
    onConfirmationComplete(false);
    // dispatch(closeLedgerSignModal());
    dismissModal();
  }, [dismissModal, onConfirmationComplete]);

  return (
    <ReusableModal ref={modalRef} style={styles.modal}>
      <LedgerConfirmationModal
        onConfirmation={executeOnLedger}
        onRejection={onRejection}
        deviceId={deviceId}
      />
    </ReusableModal>
  );
};

export default React.memo(LedgerMessageSignModal);
