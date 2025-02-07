import { ScrollView, type ScrollViewProps } from "react-native";
import { forwardRef } from "react";

export type ThemedScrollViewProps = ScrollViewProps & {
  lightColor?: string;
  darkColor?: string;
};

export const ThemedScrollView = forwardRef<ScrollView, ThemedScrollViewProps>(
  ({ style, lightColor, darkColor, ...otherProps }, ref) => {
    return <ScrollView ref={ref} style={style} {...otherProps} />;
  }
);
