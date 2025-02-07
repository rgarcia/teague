import React, { useState, useRef, useEffect } from "react";
import { StyleSheet, useColorScheme, ScrollView } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedPressable } from "@/components/ThemedPressable";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { ThemedSwitch } from "@/components/ThemedSwitch";
import { useEvent } from "@/contexts/event";
import { Colors } from "@/constants/Colors";

export interface EventsProps {
  isExpanded: boolean;
}

export default function Events({ isExpanded }: EventsProps) {
  const colorScheme = useColorScheme() ?? "light";
  const { loggedEvents, toggleExpand } = useEvent();
  const [showDeltaEvents, setShowDeltaEvents] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const getDirectionArrow = (direction: string) => {
    if (direction === "client") return { symbol: "▲", color: "#7f5af0" };
    if (direction === "server") return { symbol: "▼", color: "#2cb67d" };
    return { symbol: "•", color: "#555" };
  };

  // Modify the useEffect to track the length of events instead of the entire array
  useEffect(() => {
    if (scrollViewRef.current) {
      // Use setTimeout to ensure the new content is rendered before scrolling
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [loggedEvents.length, showDeltaEvents]); // Only trigger on length changes

  if (!isExpanded) return null;

  const filteredEvents = showDeltaEvents
    ? loggedEvents
    : loggedEvents.filter((log) => {
        const eventName = log.eventName.toLowerCase();
        return !(
          eventName.includes("delta") ||
          eventName.includes("response.output_item.added") ||
          eventName.includes("response.content_part.added") ||
          eventName.includes("response.audio.done") ||
          eventName.includes("response.content_part.done") ||
          eventName.includes("rate_limits.updated")
        );
      });

  return (
    <ThemedView style={styles.container}>
      <ThemedView
        style={[
          styles.header,
          { backgroundColor: Colors[colorScheme].background },
        ]}
      >
        <ThemedView style={styles.headerContent}>
          <ThemedText
            style={[styles.headerText, { color: Colors[colorScheme].text }]}
          >
            Logs
          </ThemedText>
          <ThemedView style={styles.headerControls}>
            <ThemedText
              style={[styles.switchLabel, { color: Colors[colorScheme].text }]}
            >
              Delta Events
            </ThemedText>
            <ThemedSwitch
              value={showDeltaEvents}
              onValueChange={setShowDeltaEvents}
              trackColor={{
                false: "#767577",
                true: Colors[colorScheme].tint,
              }}
            />
          </ThemedView>
        </ThemedView>
      </ThemedView>
      <ThemedScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        onContentSizeChange={() =>
          scrollViewRef.current?.scrollToEnd({ animated: true })
        }
      >
        {filteredEvents.map((log) => {
          const arrowInfo = getDirectionArrow(log.direction);
          const isError =
            log.eventName.toLowerCase().includes("error") ||
            log.eventData?.response?.status_details?.error != null;

          return (
            <ThemedPressable
              key={log.id}
              onPress={() => toggleExpand(log.id)}
              style={[
                styles.logItem,
                { backgroundColor: Colors[colorScheme].background },
              ]}
            >
              <ThemedView style={styles.logHeader}>
                <ThemedView style={styles.logHeaderLeft}>
                  <ThemedText
                    style={[styles.arrow, { color: arrowInfo.color }]}
                  >
                    {arrowInfo.symbol}
                  </ThemedText>
                  <ThemedText
                    style={[
                      styles.eventName,
                      { color: isError ? "#dc2626" : Colors[colorScheme].text },
                    ]}
                    numberOfLines={1}
                  >
                    {log.eventName}
                  </ThemedText>
                </ThemedView>
                <ThemedText style={styles.timestamp}>
                  {log.timestamp}
                </ThemedText>
              </ThemedView>

              {log.expanded && log.eventData && (
                <ThemedView style={styles.eventData}>
                  <ThemedText
                    style={[
                      styles.eventDataText,
                      { color: Colors[colorScheme].text },
                    ]}
                  >
                    {JSON.stringify(log.eventData, null, 2)}
                  </ThemedText>
                </ThemedView>
              )}
            </ThemedPressable>
          );
        })}
      </ThemedScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 0.5,
    borderLeftWidth: 1,
    borderLeftColor: "#e5e5e5",
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerText: {
    fontSize: 16,
    fontWeight: "600",
  },
  switchLabel: {
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  logItem: {
    borderTopWidth: 0,
    borderTopColor: "#e5e5e5",
    padding: 0,
  },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  arrow: {
    marginRight: 8,
    fontSize: 14,
  },
  eventName: {
    fontSize: 14,
    flex: 1,
  },
  timestamp: {
    fontSize: 12,
    color: "#6b7280",
    marginLeft: 8,
  },
  eventData: {
    marginTop: 8,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: "#e5e5e5",
  },
  eventDataText: {
    fontSize: 12,
    fontFamily: "SpaceMono",
  },
});
