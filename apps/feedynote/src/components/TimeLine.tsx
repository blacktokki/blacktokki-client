import React from "react";
import { FlatList, TouchableOpacity, StyleSheet, I18nManager, Platform, Image } from "react-native";
import { View, Text } from '@blacktokki/core';
import { List } from "react-native-paper";

const EventTime = ({ time: { content, style: timeStyle } = {}, style }:any) => {
  return (
    <View style={[styles.timeContainer, style]}>
      <Text style={[styles.time, timeStyle]}>{content}</Text>
    </View>
  );
};

const EventIcon = ({ icon: OriginalIcon = {}, iconStyle, lineStyle }:any) => {
  // Determines whether we are trying to render a custom icon component, or use the default
  const iconIsComponent = typeof OriginalIcon === "function";
  let iconToBeRendered = iconIsComponent ? (
    <OriginalIcon styles={[styles.icon, iconStyle]} />
  ) : (<List.Icon
      icon={OriginalIcon.content}
      style={[
        styles.icon,
        OriginalIcon.style ? OriginalIcon.style : null
      ]}
    />
  );

  return (
    <View style={[styles.iconContainer, iconStyle]}>
      {iconToBeRendered}
      <View style={[styles.verticalLine, lineStyle]} />
    </View>
  );
};

/*
Event component, is the component in which you can render whatever the event is about,
e.g. Title, description, or even render a custom template by sending a render-prop with whatsoever
content you need.
*/
const Event = ({ children, style }:any) => {
  return <View style={[styles.eventContainer, style]}>{children}</View>;
};

/*
Row component, is the component that combines all the sub-components (EventIcon, Event, EventTime) and
gets each 'event' as an argument of type object
*/
export const TimeLineRow = ({
  event = {},
  eventStyle,
  timeContainerStyle,
  iconContainerStyle,
  lineStyle,
  contentContainerStyle
}: any) => {
  const {
    title: OriginalTitle = {},
    description: OriginalDescription = {},
    imageUrl,
    time,
    icon,
    pressAction
  } = event;

  // Determines whether or not the Row is clickable, and acts accordingly
  const RowComp:React.ComponentType<any> = pressAction ? TouchableOpacity : View

  // Determines whether the title is just a text and its style, or a render-prop function, and acts accrodingly
  const titleIsComponent = OriginalTitle && typeof OriginalTitle === "function";
  const title = titleIsComponent ? (
    <OriginalTitle styles={styles.title} />
  ) : (
      <Text style={[styles.title, {fontSize:14}]}>
        {OriginalTitle}
      </Text>
  );

  // Determines whether the description is just a text and its style, or a render-prop function, and acts accrodingly
  const descriptionIsComponent =
    OriginalDescription && typeof OriginalDescription === "function";
  const description = descriptionIsComponent ? (
    <OriginalDescription styles={styles.description} />
  ) : (
    <View style={{flexDirection:'row'}}>
      {imageUrl?<Image source={{uri:imageUrl}} resizeMode="cover" style={{ width:'33%', maxWidth:150, minHeight:120, borderWidth:1}}/>:undefined}
      <Text style={[styles.description, {fontSize:12}]}>
        {OriginalDescription}
      </Text>
    </View>
  );

  return (
    <RowComp style={[styles.row, eventStyle]} onPress={pressAction}>
      <EventTime time={time} style={timeContainerStyle} />
      <EventIcon
        icon={icon}
        iconStyle={iconContainerStyle}
        lineStyle={lineStyle}
      />
      <Event style={contentContainerStyle}>
        {title}
        {description}
      </Event>
    </RowComp>
  );
};

export default ({
  data = [], // The actual event's array, array of objects, each object represents a single event
  eventStyle = {}, // Each event's whole row's style
  timeContainerStyle = {}, // The style object of the container that holds the time
  iconContainerStyle = {}, // The style object of the container that holds the icon
  lineStyle = {}, // The vertical line's style object
  contentContainerStyle = {}, // The style object of the container that holds the content i.e. title and description
  onEndReachedThreshold,
  onEndReached,
  TimelineFooter,
  TimelineHeader,
  ...rest
}: any) => {
  const events = (
    <FlatList
      data={data}
      renderItem={({ item }) => (
        <TimeLineRow
          event={item}
          eventStyle={eventStyle}
          timeContainerStyle={timeContainerStyle}
          iconContainerStyle={iconContainerStyle}
          lineStyle={lineStyle}
          contentContainerStyle={contentContainerStyle}
        />
      )}
      keyExtractor={(_, ndx) => ndx.toString()}
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold || 0}
      ListFooterComponent={TimelineFooter}
      ListHeaderComponent={TimelineHeader}
      {...rest}
    />
  );

  return <View style={styles.container}>{events}</View>;
};

const styles = StyleSheet.create({
    container: {
      flex: 1,
      width: "100%"
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginVertical: 5
    },
    timeContainer: {
      flexBasis: "15%",
      paddingTop:10,
    },
    time: {
      fontSize: 12,
      color: "#aaa",
      fontStyle: "italic",
      textAlign: 'center'
    },
    iconContainer: {
      flexBasis: "5%",
      alignItems: "center",
      alignSelf: "stretch",
      marginHorizontal: "5%"
    },
    verticalLine: {
      flex: 1,
      width: 1,
      backgroundColor: "#ededed"
    },
    eventContainer: {
      flexBasis: "65%",
      flexGrow:1,
      alignItems: "flex-start",
      padding: 16,
      borderRadius: 15,
      shadowOffset: { width: I18nManager.isRTL ? 8 : -8, height: 0 },
      shadowColor: "#888",
      shadowOpacity: 0.2,
      marginBottom: 10,
      borderTopLeftRadius: 0,
    },
    icon: {
      textAlign: "center",
      width: 20,
      height: 20,
      backgroundColor: "#6F98FA",
      paddingTop: Platform.OS === "ios" ? 2.5 : 5,
      borderRadius: 10,
      fontSize: 9,
      overflow: "hidden",
      borderWidth: 3,
      borderColor: '#e0e9ff'
    },
    title: {
      fontSize: 12,
      fontWeight: "bold",
      textAlign: "left",
      marginBottom: 5,
      lineHeight: 20
    },
    description: {
      textAlign: "left",
      fontSize: 11,
      lineHeight: 18,
      paddingBottom: 10,
    }
  });