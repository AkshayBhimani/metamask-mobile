import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import {
  Switch,
  Alert,
  ActivityIndicator,
  Text,
  View,
  SafeAreaView,
  StyleSheet,
  Image,
  InteractionManager,
  TouchableWithoutFeedback,
  Keyboard,
  BackHandler,
} from 'react-native';
import AsyncStorage from '@react-native-community/async-storage';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Button from 'react-native-button';
import Engine from '../../../core/Engine';
import StyledButton from '../../UI/StyledButton';
import { fontStyles, colors as importedColors } from '../../../styles/common';
import { strings } from '../../../../locales/i18n';
import SecureKeychain from '../../../core/SecureKeychain';
import FadeOutOverlay from '../../UI/FadeOutOverlay';
import setOnboardingWizardStep from '../../../actions/wizard';
import { logIn, logOut, checkedAuth } from '../../../actions/user';
import { connect } from 'react-redux';
import Device from '../../../util/device';
import { OutlinedTextField } from 'react-native-material-textfield';
import BiometryButton from '../../UI/BiometryButton';
import { recreateVaultWithSamePassword } from '../../../core/Vault';
import Logger from '../../../util/Logger';
import {
  BIOMETRY_CHOICE_DISABLED,
  ONBOARDING_WIZARD,
  ENCRYPTION_LIB,
  TRUE,
  ORIGINAL,
  EXISTING_USER,
} from '../../../constants/storage';
import { passwordRequirementsMet } from '../../../util/password';
import ErrorBoundary from '../ErrorBoundary';
import WarningExistingUserModal from '../../UI/WarningExistingUserModal';
import Icon from 'react-native-vector-icons/FontAwesome';
import { trackErrorAsAnalytics } from '../../../util/analyticsV2';
import { tlc, toLowerCaseEquals } from '../../../util/general';
import DefaultPreference from 'react-native-default-preference';
import { ThemeContext, mockTheme } from '../../../util/theme';
import AnimatedFox from 'react-native-animated-fox';
import {
  DELETE_WALLET_CONTAINER_ID,
  DELETE_WALLET_INPUT_BOX_ID,
  LOGIN_PASSWORD_ERROR,
  RESET_WALLET_ID,
} from '../../../constants/test-ids';

const deviceHeight = Device.getDeviceHeight();
const breakPoint = deviceHeight < 700;

const createStyles = (colors) =>
  StyleSheet.create({
    mainWrapper: {
      backgroundColor: colors.background.default,
      flex: 1,
    },
    wrapper: {
      flex: 1,
      paddingHorizontal: 32,
    },
    foxWrapper: {
      justifyContent: 'center',
      alignSelf: 'center',
      width: Device.isIos() ? 130 : 100,
      height: Device.isIos() ? 130 : 100,
      marginTop: 100,
    },
    image: {
      alignSelf: 'center',
      width: Device.isIos() ? 130 : 100,
      height: Device.isIos() ? 130 : 100,
    },
    title: {
      fontSize: Device.isAndroid() ? 30 : 35,
      marginTop: 20,
      marginBottom: 20,
      color: colors.text.default,
      justifyContent: 'center',
      textAlign: 'center',
      ...fontStyles.bold,
    },
    field: {
      flex: 1,
      marginBottom: Device.isAndroid() ? 0 : 10,
      flexDirection: 'column',
    },
    label: {
      color: colors.text.default,
      fontSize: 16,
      marginBottom: 12,
      ...fontStyles.normal,
    },
    ctaWrapper: {
      marginTop: 20,
    },
    footer: {
      marginVertical: 40,
    },
    errorMsg: {
      color: colors.error.default,
      ...fontStyles.normal,
      lineHeight: 20,
    },
    goBack: {
      marginVertical: 14,
      color: colors.primary.default,
      ...fontStyles.normal,
    },
    biometrics: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 20,
      marginBottom: 30,
    },
    biometryLabel: {
      flex: 1,
      fontSize: 16,
      color: colors.text.default,
      ...fontStyles.normal,
    },
    biometrySwitch: {
      flex: 0,
    },
    input: {
      ...fontStyles.normal,
      fontSize: 16,
      paddingTop: 2,
      color: colors.text.default,
    },
    cant: {
      width: 280,
      alignSelf: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      ...fontStyles.normal,
      fontSize: 16,
      lineHeight: 24,
      color: colors.text.default,
    },
    areYouSure: {
      width: '100%',
      padding: breakPoint ? 16 : 24,
      justifyContent: 'center',
      alignSelf: 'center',
    },
    heading: {
      marginHorizontal: 6,
      color: colors.text.default,
      ...fontStyles.bold,
      fontSize: 20,
      textAlign: 'center',
      lineHeight: breakPoint ? 24 : 26,
    },
    red: {
      marginHorizontal: 24,
      color: colors.error.default,
    },
    warningText: {
      ...fontStyles.normal,
      textAlign: 'center',
      fontSize: 14,
      lineHeight: breakPoint ? 18 : 22,
      color: colors.text.default,
      marginTop: 20,
    },
    warningIcon: {
      alignSelf: 'center',
      color: colors.error.default,
      marginVertical: 10,
    },
    bold: {
      ...fontStyles.bold,
    },
    delete: {
      marginBottom: 20,
    },
    deleteWarningMsg: {
      ...fontStyles.normal,
      fontSize: 16,
      lineHeight: 20,
      marginTop: 10,
      color: colors.error.default,
    },
  });

const DELETE = 'delete';
const PASSCODE_NOT_SET_ERROR = 'Error: Passcode not set.';
const WRONG_PASSWORD_ERROR = 'Error: Decrypt failed';
const WRONG_PASSWORD_ERROR_ANDROID =
  'Error: error:1e000065:Cipher functions:OPENSSL_internal:BAD_DECRYPT';
const VAULT_ERROR = 'Error: Cannot unlock without a previous vault.';
const isTextDelete = (text) => tlc(text) === DELETE;

/**
 * View where returning users can authenticate
 */
class Login extends PureComponent {
  static propTypes = {
    /**
     * The navigator object
     */
    navigation: PropTypes.object,
    /**
     * Action to set onboarding wizard step
     */
    setOnboardingWizardStep: PropTypes.func,
    /**
     * Temporary string that controls if componentDidMount should handle initial auth logic on mount
     */
    initialScreen: PropTypes.string,
    /**
     * A string representing the selected address => account
     */
    selectedAddress: PropTypes.string,
    logIn: PropTypes.func,
    logOut: PropTypes.func,
    /**
     * TEMPORARY state for animation control on Nav/App/index.js
     */
    checkedAuth: PropTypes.func,
  };

  state = {
    password: '',
    biometryType: null,
    rememberMe: false,
    biometryChoice: false,
    loading: false,
    error: null,
    biometryPreviouslyDisabled: false,
    warningModalVisible: false,
    deleteModalVisible: false,
    disableDelete: true,
    deleteText: '',
    showDeleteWarning: false,
    hasBiometricCredentials: false,
  };

  fieldRef = React.createRef();

  async componentDidMount() {
    const { initialScreen } = this.props;
    const { KeyringController } = Engine.context;
    const shouldHandleInitialAuth = initialScreen !== 'onboarding';
    BackHandler.addEventListener('hardwareBackPress', this.handleBackPress);

    // Lock keyring just in case
    if (KeyringController.isUnlocked()) {
      await KeyringController.setLocked();
    }

    const biometryType = await SecureKeychain.getSupportedBiometryType();
    if (biometryType) {
      const previouslyDisabled = await AsyncStorage.getItem(
        BIOMETRY_CHOICE_DISABLED,
      );
      const enabled = !(previouslyDisabled && previouslyDisabled === TRUE);

      this.setState({
        biometryType: Device.isAndroid() ? 'biometrics' : biometryType,
        biometryChoice: enabled,
        biometryPreviouslyDisabled: !!previouslyDisabled,
      });
      if (shouldHandleInitialAuth) {
        try {
          if (enabled && !previouslyDisabled) {
            await this.tryBiometric();
          }
        } catch (e) {
          console.warn(e);
        }
        if (!enabled) {
          await this.checkIfRememberMeEnabled();
        }
      }
    } else {
      shouldHandleInitialAuth && (await this.checkIfRememberMeEnabled());
    }

    this.props.checkedAuth();
  }

  componentWillUnmount() {
    BackHandler.removeEventListener('hardwareBackPress', this.handleBackPress);
  }

  handleBackPress = () => {
    this.props.logOut();
    return false;
  };

  /**
   * Checks to see if the user has enabled Remember Me and logs
   * into the application if it is enabled.
   */
  checkIfRememberMeEnabled = async () => {
    const credentials = await SecureKeychain.getGenericPassword();
    if (credentials) {
      this.setState({ rememberMe: true });
      // Restore vault with existing credentials
      const { KeyringController } = Engine.context;
      try {
        await KeyringController.submitPassword(credentials.password);
        const encryptionLib = await AsyncStorage.getItem(ENCRYPTION_LIB);
        if (encryptionLib !== ORIGINAL) {
          await recreateVaultWithSamePassword(
            credentials.password,
            this.props.selectedAddress,
          );
          await AsyncStorage.setItem(ENCRYPTION_LIB, ORIGINAL);
        }
        // Get onboarding wizard state
        const onboardingWizard = await DefaultPreference.get(ONBOARDING_WIZARD);
        if (!onboardingWizard) {
          this.props.setOnboardingWizardStep(1);
        }

        // Only way to land back on Login is to log out, which clears credentials (meaning we should not show biometric button)
        this.setState({ hasBiometricCredentials: false });
        delete credentials.password;
        this.props.logIn();
        this.props.navigation.replace('HomeNav');
      } catch (error) {
        this.setState({ rememberMe: false });
        Logger.error(error, 'Failed to login using Remember Me');
      }
    }
  };

  onLogin = async (hasCredentials = false) => {
    const { password } = this.state;
    const { current: field } = this.fieldRef;
    const locked = !passwordRequirementsMet(password);
    if (locked) this.setState({ error: strings('login.invalid_password') });
    if (this.state.loading || locked) return;
    try {
      this.setState({ loading: true, error: null });
      const { KeyringController } = Engine.context;
      // Restore vault with user entered password
      await KeyringController.submitPassword(this.state.password);
      const encryptionLib = await AsyncStorage.getItem(ENCRYPTION_LIB);
      const existingUser = await AsyncStorage.getItem(EXISTING_USER);
      if (encryptionLib !== ORIGINAL && existingUser) {
        await recreateVaultWithSamePassword(
          this.state.password,
          this.props.selectedAddress,
        );
        await AsyncStorage.setItem(ENCRYPTION_LIB, ORIGINAL);
      }
      // If the tryBiometric has been called and they password was retrived don't set it again
      if (!hasCredentials) {
        if (this.state.biometryChoice && this.state.biometryType) {
          await SecureKeychain.setGenericPassword(
            this.state.password,
            SecureKeychain.TYPES.BIOMETRICS,
          );
        } else if (this.state.rememberMe) {
          await SecureKeychain.setGenericPassword(
            this.state.password,
            SecureKeychain.TYPES.REMEMBER_ME,
          );
        } else {
          await SecureKeychain.resetGenericPassword();
        }
      }

      this.props.logIn();

      // Get onboarding wizard state
      const onboardingWizard = await DefaultPreference.get(ONBOARDING_WIZARD);
      if (onboardingWizard) {
        this.props.navigation.replace('HomeNav');
      } else {
        this.props.setOnboardingWizardStep(1);
        this.props.navigation.replace('HomeNav');
      }
      // Only way to land back on Login is to log out, which clears credentials (meaning we should not show biometric button)
      this.setState({
        loading: false,
        password: '',
        hasBiometricCredentials: false,
      });
      field.setValue('');
    } catch (e) {
      // Should we force people to enable passcode / biometrics?
      const error = e.toString();
      if (
        toLowerCaseEquals(error, WRONG_PASSWORD_ERROR) ||
        toLowerCaseEquals(error, WRONG_PASSWORD_ERROR_ANDROID)
      ) {
        this.setState({
          loading: false,
          error: strings('login.invalid_password'),
        });

        trackErrorAsAnalytics('Login: Invalid Password', error);

        return;
      } else if (error === PASSCODE_NOT_SET_ERROR) {
        Alert.alert(
          'Security Alert',
          'In order to proceed, you need to turn Passcode on or any biometrics authentication method supported in your device (FaceID, TouchID or Fingerprint)',
        );
        this.setState({ loading: false });
      } else if (toLowerCaseEquals(error, VAULT_ERROR)) {
        this.setState({
          loading: false,
          error: strings('login.clean_vault_error'),
        });
      } else {
        this.setState({ loading: false, error });
      }
      Logger.error(error, 'Failed to login');
    }
  };

  triggerLogIn = () => {
    this.onLogin();
  };

  delete = async () => {
    const { KeyringController } = Engine.context;
    try {
      await Engine.resetState();
      await KeyringController.createNewVaultAndKeychain(`${Date.now()}`);
      await KeyringController.setLocked();
      this.deleteExistingUser();
    } catch (error) {
      Logger.log(error, `Failed to createNewVaultAndKeychain: ${error}`);
    }
  };

  deleteExistingUser = async () => {
    try {
      await AsyncStorage.removeItem(EXISTING_USER);
      // We need to reset instead of navigate here otherwise, OnboardingRootNav remembers the last screen that it was on, which is most likely not OnboardingNav.
      this.props.navigation?.reset({
        routes: [
          {
            name: 'OnboardingRootNav',
            state: {
              routes: [
                {
                  name: 'OnboardingNav',
                  params: { screen: 'Onboarding', params: { delete: true } },
                },
              ],
            },
          },
        ],
      });
    } catch (error) {
      Logger.log(
        error,
        `Failed to remove key: ${EXISTING_USER} from AsyncStorage`,
      );
    }
  };

  toggleWarningModal = () =>
    this.setState((state) => ({
      warningModalVisible: !state.warningModalVisible,
    }));

  toggleDeleteModal = () =>
    this.setState((state) => ({
      deleteModalVisible: !state.deleteModalVisible,
    }));

  checkDelete = (text) => {
    this.setState({
      deleteText: text,
      showDeleteWarning: false,
      disableDelete: !isTextDelete(text),
    });
  };

  submitDelete = () => {
    const { deleteText } = this.state;
    this.setState({ showDeleteWarning: !isTextDelete(deleteText) });
    if (isTextDelete(deleteText)) this.delete();
  };

  updateBiometryChoice = async (biometryChoice) => {
    if (!biometryChoice) {
      await AsyncStorage.setItem(BIOMETRY_CHOICE_DISABLED, TRUE);
    } else {
      await AsyncStorage.removeItem(BIOMETRY_CHOICE_DISABLED);
    }
    this.setState({ biometryChoice });
  };

  renderSwitch = () => {
    const colors = this.context.colors || mockTheme.colors;
    const styles = createStyles(colors);

    if (this.state.biometryType && !this.state.biometryPreviouslyDisabled) {
      return (
        <View style={styles.biometrics}>
          <Text style={styles.biometryLabel}>
            {strings(
              `biometrics.enable_${this.state.biometryType.toLowerCase()}`,
            )}
          </Text>
          <Switch
            onValueChange={(biometryChoice) =>
              this.updateBiometryChoice(biometryChoice)
            } // eslint-disable-line react/jsx-no-bind
            value={this.state.biometryChoice}
            style={styles.biometrySwitch}
            trackColor={{
              true: colors.primary.default,
              false: colors.border.muted,
            }}
            thumbColor={importedColors.white}
            ios_backgroundColor={colors.border.muted}
          />
        </View>
      );
    }

    return (
      <View style={styles.biometrics}>
        <Text style={styles.biometryLabel}>
          {strings(`choose_password.remember_me`)}
        </Text>
        <Switch
          onValueChange={(rememberMe) => this.setState({ rememberMe })} // eslint-disable-line react/jsx-no-bind
          value={this.state.rememberMe}
          style={styles.biometrySwitch}
          trackColor={{
            true: colors.primary.default,
            false: colors.border.muted,
          }}
          thumbColor={importedColors.white}
          ios_backgroundColor={colors.border.muted}
        />
      </View>
    );
  };

  setPassword = (val) => this.setState({ password: val });

  onCancelPress = () => {
    this.toggleWarningModal();
    InteractionManager.runAfterInteractions(this.toggleDeleteModal);
  };

  tryBiometric = async (e) => {
    if (e) e.preventDefault();
    const { current: field } = this.fieldRef;
    field.blur();
    try {
      const credentials = await SecureKeychain.getGenericPassword();
      if (!credentials) {
        this.setState({ hasBiometricCredentials: false });
        return;
      }
      field.blur();
      this.setState({ password: credentials.password });
      field.setValue(credentials.password);
      field.blur();
      await this.onLogin(true);
    } catch (error) {
      this.setState({ hasBiometricCredentials: true });
      Logger.log(error);
    }
    field.blur();
  };

  render = () => {
    const colors = this.context.colors || mockTheme.colors;
    const themeAppearance = this.context.themeAppearance || 'light';
    const styles = createStyles(colors);

    return (
      <ErrorBoundary view="Login">
        <WarningExistingUserModal
          warningModalVisible={this.state.warningModalVisible}
          cancelText={strings('login.i_understand')}
          onCancelPress={this.onCancelPress}
          onRequestClose={this.toggleWarningModal}
          onConfirmPress={this.toggleWarningModal}
        >
          <View style={styles.areYouSure} testID={DELETE_WALLET_CONTAINER_ID}>
            <Icon
              style={styles.warningIcon}
              size={46}
              color={colors.error.default}
              name="exclamation-triangle"
            />
            <Text style={[styles.heading, styles.red]}>
              {strings('login.are_you_sure')}
            </Text>
            <Text style={styles.warningText}>
              <Text>{strings('login.your_current_wallet')}</Text>
              <Text style={styles.bold}>{strings('login.removed_from')}</Text>
              <Text>{strings('login.this_action')}</Text>
            </Text>
            <Text style={[styles.warningText, styles.noMarginBottom]}>
              <Text>{strings('login.you_can_only')}</Text>
              <Text style={styles.bold}>
                {strings('login.recovery_phrase')}
              </Text>
              <Text>{strings('login.metamask_does_not')}</Text>
            </Text>
          </View>
        </WarningExistingUserModal>

        <WarningExistingUserModal
          warningModalVisible={this.state.deleteModalVisible}
          cancelText={strings('login.delete_my')}
          cancelButtonDisabled={this.state.disableDelete}
          onCancelPress={this.submitDelete}
          onRequestClose={this.toggleDeleteModal}
          onConfirmPress={this.toggleDeleteModal}
          onSubmitEditing={this.submitDelete}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.areYouSure}>
              <Text style={[styles.heading, styles.delete]}>
                {strings('login.type_delete', { [DELETE]: DELETE })}
              </Text>
              <OutlinedTextField
                style={styles.input}
                testID={DELETE_WALLET_INPUT_BOX_ID}
                autoFocus
                returnKeyType={'done'}
                onChangeText={this.checkDelete}
                autoCapitalize="none"
                value={this.state.deleteText}
                baseColor={colors.border.default}
                tintColor={colors.primary.default}
                placeholderTextColor={colors.text.muted}
                onSubmitEditing={this.submitDelete}
                keyboardAppearance={themeAppearance}
              />
              {this.state.showDeleteWarning && (
                <Text style={styles.deleteWarningMsg}>
                  {strings('login.cant_proceed')}
                </Text>
              )}
            </View>
          </TouchableWithoutFeedback>
        </WarningExistingUserModal>

        <SafeAreaView style={styles.mainWrapper}>
          <KeyboardAwareScrollView
            style={styles.wrapper}
            resetScrollToCoords={{ x: 0, y: 0 }}
          >
            <View testID={'login'}>
              <View style={styles.foxWrapper}>
                {Device.isAndroid() ? (
                  <Image
                    source={require('../../../images/fox.png')}
                    style={styles.image}
                    resizeMethod={'auto'}
                  />
                ) : (
                  <AnimatedFox bgColor={colors.background.default} />
                )}
              </View>
              <Text style={styles.title}>{strings('login.title')}</Text>
              <View style={styles.field}>
                <Text style={styles.label}>{strings('login.password')}</Text>
                <OutlinedTextField
                  style={styles.input}
                  placeholder={strings('login.password')}
                  placeholderTextColor={colors.text.muted}
                  testID={'login-password-input'}
                  returnKeyType={'done'}
                  autoCapitalize="none"
                  secureTextEntry
                  ref={this.fieldRef}
                  onChangeText={this.setPassword}
                  value={this.state.password}
                  baseColor={colors.border.default}
                  tintColor={colors.primary.default}
                  onSubmitEditing={this.triggerLogIn}
                  renderRightAccessory={() => (
                    <BiometryButton
                      onPress={this.tryBiometric}
                      hidden={
                        !(
                          this.state.biometryChoice &&
                          this.state.biometryType &&
                          this.state.hasBiometricCredentials
                        )
                      }
                      type={this.state.biometryType}
                    />
                  )}
                  keyboardAppearance={themeAppearance}
                />
              </View>

              {this.renderSwitch()}

              {!!this.state.error && (
                <Text style={styles.errorMsg} testID={LOGIN_PASSWORD_ERROR}>
                  {this.state.error}
                </Text>
              )}
              <View style={styles.ctaWrapper} testID={'log-in-button'}>
                <StyledButton type={'confirm'} onPress={this.triggerLogIn}>
                  {this.state.loading ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.primary.inverse}
                    />
                  ) : (
                    strings('login.unlock_button')
                  )}
                </StyledButton>
              </View>

              <View style={styles.footer}>
                <Text style={styles.cant}>{strings('login.go_back')}</Text>
                <Button
                  style={styles.goBack}
                  onPress={this.toggleWarningModal}
                  testID={RESET_WALLET_ID}
                >
                  {strings('login.reset_wallet')}
                </Button>
              </View>
            </View>
          </KeyboardAwareScrollView>
          <FadeOutOverlay />
        </SafeAreaView>
      </ErrorBoundary>
    );
  };
}

Login.contextType = ThemeContext;

const mapStateToProps = (state) => ({
  selectedAddress:
    state.engine.backgroundState.PreferencesController?.selectedAddress,
  initialScreen: state.user.initialScreen,
});

const mapDispatchToProps = (dispatch) => ({
  setOnboardingWizardStep: (step) => dispatch(setOnboardingWizardStep(step)),
  logIn: () => dispatch(logIn()),
  logOut: () => dispatch(logOut()),
  checkedAuth: () => dispatch(checkedAuth('login')),
});

export default connect(mapStateToProps, mapDispatchToProps)(Login);
