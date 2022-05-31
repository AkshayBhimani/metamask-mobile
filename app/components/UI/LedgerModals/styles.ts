/* eslint-disable import/prefer-default-export */
import { StyleSheet } from 'react-native';

export const createStyles = (colors: any) =>
  StyleSheet.create({
    modal: {
      justifyContent: 'flex-end',
      margin: 0,
      height: 600,
      backgroundColor: 'transparent',
    },
  });
