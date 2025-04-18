import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np
from datetime import datetime

# Data for experiments
dates = [
    "2025-04-02",
    "2025-04-03",
    "2025-04-04",
    "2025-04-05",
    "2025-04-06",
    "2025-04-07",
    "2025-04-08",
    "2025-04-09",
    "2025-04-10",
    "2025-04-11",
    "2025-04-12",
    "2025-04-13",
    "2025-04-14",
    "2025-04-15",
    "2025-04-16",
]

# TVL-adjusted markouts data (in percentage)
markouts_A = [
    -0.513278,
    0.075152,
    0.102589,
    0.025547,
    -3.061470,
    0.210801,
    -0.421842,
    -2.678665,
    -0.918781,
    -0.045780,
    -0.316551,
    -0.009065,
    0.049424,
    -0.007495,
    0.122654,
]

markouts_B = [
    -1.112368,
    0.082528,
    0.171258,
    0.047151,
    -4.410310,
    0.077922,
    -0.193508,
    -2.000434,
    -2.830805,
    -0.040960,
    -0.226915,
    0.152360,
    0.083627,
    -0.015734,
    0.298960,
]

markouts_C = [
    -0.523203,
    0.121918,
    0.117761,
    0.032120,
    -2.780250,
    0.395140,
    -0.302648,
    -2.231630,
    -0.601404,
    -0.015811,
    -0.279299,
    0.016821,
    0.114142,
    0.023292,
    0.158981,
]

uniswap_markouts = [
    -0.087730,
    0.084980,
    0.119978,
    0.047620,
    -1.282913,
    0.317386,
    0.073771,
    -0.668295,
    -0.435705,
    0.079784,
    -0.152536,
    0.095929,
    0.210961,
    -0.006330,
    0.172998,
]

# Convert dates to datetime objects
dates = [datetime.strptime(date, "%Y-%m-%d") for date in dates]

# Calculate running totals
running_total_A = np.cumsum(markouts_A)
running_total_B = np.cumsum(markouts_B)
running_total_C = np.cumsum(markouts_C)
running_total_uniswap = np.cumsum(uniswap_markouts)

# Create the figure with professional styling
plt.figure(figsize=(12, 8))
plt.style.use("ggplot")

# Custom colors for better brand identity
colors = {
    "A": "#3366CC",  # Blue
    "B": "#FF9933",  # Orange
    "C": "#33CC99",  # Teal
    "Uniswap": "#ff37c7",  # Pink
}

# Plot running totals with custom styling
plt.plot(
    dates,
    running_total_A,
    label="Experiment A",
    linewidth=2.5,
    marker="o",
    markersize=6,
    color=colors["A"],
)
plt.plot(
    dates,
    running_total_B,
    label="Experiment B",
    linewidth=2.5,
    marker="s",
    markersize=6,
    color=colors["B"],
)
plt.plot(
    dates,
    running_total_C,
    label="Experiment C",
    linewidth=2.5,
    marker="^",
    markersize=6,
    color=colors["C"],
)
plt.plot(
    dates,
    running_total_uniswap,
    label="Uniswap v3",
    linewidth=2.5,
    linestyle="--",
    color=colors["Uniswap"],
)

# Format x-axis to show dates nicely
plt.gca().xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
plt.gca().xaxis.set_major_locator(mdates.DayLocator(interval=2))
plt.xticks(rotation=45)

# Format y-axis to show percentages
plt.gca().yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"{x:.1f}%"))

# Add zero line for reference
plt.axhline(y=0, color="gray", linestyle="-", alpha=0.5)

# Add labels and title with professional styling
plt.xlabel("Date (April 2025)", fontsize=14, fontweight="bold")
plt.ylabel("Cumulative TVL-Adjusted Markout (%)", fontsize=14, fontweight="bold")
plt.title(
    "Bunni Experiments: Round 1",
    fontsize=18,
    fontweight="bold",
)

# Experiment descriptions
descriptions = {
    "A": "Base config, 48-hour TWAP",
    "B": "Higher concentration, 120-hour TWAP",
    "C": "Aggressive dynamic fees, 48-hour TWAP",
}

# Create custom legend with descriptions
legend_labels = [
    f'Experiment A: {descriptions["A"]}',
    f'Experiment B: {descriptions["B"]}',
    f'Experiment C: {descriptions["C"]}',
    "Uniswap v3 (0.05% fee pool on Base)",
]

plt.legend(legend_labels, loc="lower left", fontsize=11, fancybox=True, framealpha=0.9)

# Add annotations for final values
for i, (label, data, color) in enumerate(
    [
        ("A", running_total_A, colors["A"]),
        ("B", running_total_B, colors["B"]),
        ("C", running_total_C, colors["C"]),
        ("Uniswap", running_total_uniswap, colors["Uniswap"]),
    ]
):
    plt.annotate(
        f"{data[-1]:.1f}%",
        xy=(dates[-1], data[-1]),
        xytext=(10, 0),
        textcoords="offset points",
        fontsize=11,
        fontweight="bold",
        color=color,
    )

# Highlight key insight - C performs best during volatility
plt.annotate(
    "Experiment C performs best\nduring volatility",
    xy=(dates[9], running_total_C[9]),
    xytext=(30, 30),
    textcoords="offset points",
    fontsize=11,
    fontweight="bold",
    arrowprops=dict(arrowstyle="->", connectionstyle="arc3,rad=.2", color="black"),
)

# Add grid for better readability
plt.grid(True, linestyle="--", alpha=0.7)

# Add Bunni branding
plt.figtext(
    0.95, 0.03, "bunni.xyz", fontsize=14, fontweight="bold", color="#666666", ha="right"
)

# Tight layout and save with high resolution
plt.tight_layout()
plt.savefig("bunni_experiments_round1.png", dpi=300, bbox_inches="tight")
plt.show()
