import React, { useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Engine from '../../../core/Engine';
import { closeLedgerSignModal } from '../../../actions/modals';
import LedgerConfirmationModal from './LedgerConfirmationModal';
import ReusableModal, { ReusableModalRef } from '../ReusableModal';
import { createStyles } from './styles';
import { useAppThemeFromContext, mockTheme } from '../../../util/theme';

const LedgerMessageSignModal = () => {
  const modalRef = useRef<ReusableModalRef | null>(null);
  const dispatch = useDispatch();
  const {
    messageParams,
    onConfirmationComplete = () => null,
    version,
    type,
    deviceId,
  } = useSelector((state: any) => state.modals.ledgerSignMessageActionParams);
  const { KeyringController } = Engine.context as any;
  const { colors } = useAppThemeFromContext() || mockTheme;
  const styles = createStyles(colors);

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
    dispatch(closeLedgerSignModal());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRejection = useCallback(() => {
    onConfirmationComplete(false);
    dispatch(closeLedgerSignModal());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
