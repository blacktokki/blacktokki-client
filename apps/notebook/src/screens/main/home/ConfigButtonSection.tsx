import { Colors, Text, useColorScheme, View } from "@blacktokki/core";
import { TouchableOpacity } from "react-native";
import { createCommonStyles } from "../../../styles";
import { navigate } from "@blacktokki/navigation";

export const ArchiveButtonSection = () => {
    const theme = useColorScheme();
    const color = Colors[theme].text;
    const commonStyles = createCommonStyles(theme);
    return (
        <TouchableOpacity style={commonStyles.header} onPress={()=>navigate('Archive', {})}>
            <Text style={{ fontSize: 20, color, fontWeight: '600' }}>Archive</Text>
            <Text>{">"}</Text>
        </TouchableOpacity>
    );
  };