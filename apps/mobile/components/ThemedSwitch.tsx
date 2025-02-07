import { Switch, type SwitchProps } from "react-native";

export type ThemedSwitchProps = SwitchProps & {
  lightColor?: string;
  darkColor?: string;
};

export function ThemedSwitch({
  style,
  lightColor,
  darkColor,
  ...otherProps
}: ThemedSwitchProps) {
  return <Switch style={style} {...otherProps} />;
}
