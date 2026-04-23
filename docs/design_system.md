# Yellow Trading Dashboard Theme — Design System

**Version:** 1.0.0
**Theme:** Light

---

## 1. Design Direction
This document defines the **Yellow Trading Dashboard Theme**, replacing the previous legacy designs. The new interface is optimized for speed, clarity, and trading workflows. It employs a light theme with a strong yellow primary brand color, ensuring critical information stands out while minimizing visual clutter.

## 2. Colors

### 2.1 Brand
*   **Primary:** `#FFC107`
*   **Primary Hover:** `#FFB300`
*   **Primary Light:** `#FFF8E1`
*   **On Primary:** `#111827`

### 2.2 Semantic
*   **Success:** `#10B981`
*   **Danger:** `#EF4444`
*   **Warning:** `#F59E0B`
*   **Info:** `#3B82F6`

### 2.3 Neutral
*   **White:** `#FFFFFF`
*   **Background:** `#F3F4F6`
*   **Surface:** `#FFFFFF`
*   **Border:** `#E5E7EB`
*   **Text Primary:** `#111827`
*   **Text Secondary:** `#6B7280`
*   **Text Tertiary:** `#9CA3AF`

---

## 3. Typography
**Font Family:** `'Inter', 'Roboto', sans-serif`

### 3.1 Type Scale
| Role | Size | Weight | Color |
| :--- | :--- | :--- | :--- |
| **H1** | 24px | 700 | Neutral Text Primary (`#111827`) |
| **H2** | 18px | 600 | Neutral Text Primary (`#111827`) |
| **Body** | 14px | 400 | Neutral Text Primary (`#111827`) |
| **Small** | 12px | 400 | Neutral Text Secondary (`#6B7280`) |
| **Ticker** | 13px | 500 | *monospace* (Inherits color based on context) |

---

## 4. Spacing & Framework

### 4.1 Spacing Scale
*   **xs:** `4px`
*   **sm:** `8px`
*   **md:** `16px`
*   **lg:** `24px`
*   **xl:** `32px`

### 4.2 Borders
*   **Width:** Default `1px`
*   **Color:** Neutral Border (`#E5E7EB`)
*   **Radius sm:** `4px`
*   **Radius md:** `8px`
*   **Radius lg:** `12px`
*   **Radius full:** `9999px`

### 4.3 Shadows
*   **Card:** `0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)`
*   **Modal:** `0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)`

---

## 5. Components

### 5.1 App Layout
*   **Sidebar Width:** `80px`
*   **Topbar Height:** `64px`
*   **Background Color:** Neutral Background (`#F3F4F6`)

### 5.2 Navigation Sidebar
*   **Items:** Watchlist, Alerts, Portfolio, Markets, Screener, Forum, Calendars
*   **Icon Color:** Neutral Text Secondary
*   **Active Icon Color:** Brand Primary
*   **Active Indicator:** Left-border `3px solid` Brand Primary

### 5.3 Top Navigation Bar
*   **Search Bar:** Neutral Background, Border Radius `md`, Icon Color Neutral Text Tertiary.
*   **Ticker Tape:**
    *   Positive Text: Semantic Success (`#10B981`)
    *   Negative Text: Semantic Danger (`#EF4444`)

### 5.4 Cards
*   **Background Color:** Neutral Surface (`#FFFFFF`)
*   **Border Radius:** `borders.radius.md` (8px)
*   **Padding:** `spacing.md` (16px)
*   **Box Shadow:** `shadows.card`
*   **Border:** `1px solid` Neutral Border (`#E5E7EB`)

### 5.5 Buttons
**Primary Button:**
*   **Background Color:** Brand Primary (`#FFC107`)
*   **Color:** Brand On Primary (`#111827`)
*   **Border Radius:** `borders.radius.md` (8px)
*   **Padding:** `8px 16px`
*   **Font Weight:** `600`

**Secondary AI Button:**
*   **Background Color:** Neutral White (`#FFFFFF`)
*   **Color:** Neutral Text Primary (`#111827`)
*   **Border:** `1px solid` Brand Primary (`#FFC107`)
*   **Icon Color:** Brand Primary (`#FFC107`)
*   **Border Radius:** `borders.radius.full` (9999px)

### 5.6 Market Data Tables
*   **Header Text:** Neutral Text Secondary (`#6B7280`)
*   **Row Border Bottom:** `1px solid` Neutral Border (`#E5E7EB`)
*   **Positive Change:** Semantic Success (`#10B981`)
*   **Negative Change:** Semantic Danger (`#EF4444`)

### 5.7 Charts
*   **Line Color:** Semantic Danger (`#EF4444`)
*   **Grid Lines:** Neutral Border (`#E5E7EB`)
*   **Axis Text:** Neutral Text Tertiary (`#9CA3AF`)

### 5.8 Trade Ticket
*   **Input Field:**
    *   Border: `1px solid` Neutral Border (`#E5E7EB`)
    *   Border Radius: `borders.radius.md` (8px)
    *   Focus Border: Brand Primary (`#FFC107`)
*   **Buy Button:**
    *   Background Color: Brand Primary (`#FFC107`)
    *   Color: Brand On Primary (`#111827`)

### 5.9 AI Chat Assistant
*   **Modal Name:** "Seal - Trading Helper"
*   **Background Color:** Neutral Surface (`#FFFFFF`)
*   **Header Border Bottom:** `1px solid` Neutral Border (`#E5E7EB`)
*   **User Bubble:**
    *   Background Color: Neutral Background (`#F3F4F6`)
    *   Color: Neutral Text Primary (`#111827`)
*   **Input Area:**
    *   Border: `1px solid` Neutral Border (`#E5E7EB`)
    *   Send Button Background: Brand Primary (`#FFC107`)
    *   Send Button Icon Color: Brand On Primary (`#111827`)
