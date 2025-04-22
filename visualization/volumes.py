import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

# Set style for better visualization
plt.style.use('ggplot')

# Function to clean volume strings and convert to float
def clean_volume(vol_str):
    return float(vol_str.replace('$', '').replace(',', ''))

# Function to format y-axis as dollars
def dollar_formatter(x, pos):
    if x >= 1000000:
        return f'${x/1000000:.1f}M'
    elif x >= 1000:
        return f'${x/1000:.0f}K'
    else:
        return f'${x:.0f}'

# Function to visualize experiment data
def visualize_experiment(router_data, category_data, experiment_name):
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(18, 8))
    fig.suptitle(f'Bunni Experiment {experiment_name} - Volume Analysis', fontsize=18, fontweight='bold')
    
    # Prepare data for router bar chart (top 10)
    router_data = router_data.sort_values('Volume (USD)', ascending=True)
    
    # Color bars based on category
    category_colors = {
        'Retail': '#33CC99',    # Teal
        'MEV Bot': '#FF9933',   # Red
        'Bunni Bot': '#3366CC', # Blue
        'Unknown': '#CCCCCC'    # Gray
    }
    
    bar_colors = [category_colors[cat] for cat in router_data['Category']]
    
    # Create bar chart
    ax1.barh(router_data['Label'], router_data['Volume (USD)'], color=bar_colors)
    ax1.set_title('Volume by Router (USD)', fontsize=14, fontweight='bold')
    ax1.xaxis.set_major_formatter(FuncFormatter(dollar_formatter))
    ax1.set_xlabel('Volume', fontsize=12)
    
    # Add percentage labels to bars
    for i, v in enumerate(router_data['Volume (USD)']):
        percentage = router_data['% of Pool Volume'].iloc[i]
        ax1.text(v + (np.max(router_data['Volume (USD)']) * 0.02), 
                i, 
                f"{percentage}%", 
                va='center', 
                fontweight='bold')
    
    # Create pie chart
    wedges, texts, autotexts = ax2.pie(
        category_data['Volume (USD)'],
        labels=None,
        autopct='%1.1f%%',
        startangle=90,
        colors=[category_colors[cat] for cat in category_data.index]
    )
    
    # Adjust pie chart appearance
    for autotext in autotexts:
        autotext.set_fontsize(10)
        autotext.set_fontweight('bold')
    
    ax2.set_title('Volume Distribution by Category', fontsize=14, fontweight='bold')
    
    # Add custom legend
    legend_labels = [f"{cat} (${volume/1000000:.2f}M, {percentage}%)" 
                    if volume >= 1000000 
                    else f"{cat} (${volume/1000:.1f}K, {percentage}%)" 
                    for cat, volume, percentage in zip(category_data.index, 
                                                       category_data['Volume (USD)'], 
                                                       category_data['Percentage'])]
    
    ax2.legend(wedges, legend_labels, loc='center left', bbox_to_anchor=(1, 0.5))
    
    plt.tight_layout()
    plt.savefig(f'bunni_experiment_{experiment_name}_volume.png', dpi=300, bbox_inches='tight')
    
    return fig

# Experiment A data
routers_A = pd.DataFrame({
    'Rank': range(1, 11),
    'Router Address': [
        '0x0000000000001ff3684f28c67538d4d072c22734',
        '0x0000002c67d68170c8ce06fe78d7e37895c41255',
        '0x5093ef099346ffe58283207e221dada47bfd862a',
        '0x2d5805a423d6ce771f06972ad4499f120902631a',
        '0xeeeeee9ec4769a09a76a83c7bc42b185872860ee',
        '0xfb33f10738d6e83a049678c1fcb9eb8b78d1417f',
        '0x9008d19f58aabd9ed0d60971565aa8510560ab41',
        '0xf1ceb16d94083606db7f4d98400554f17125483b',
        '0xacff4cabde48944b89eb652a3b90e7bcef7dddac',
        '0x7ae782dcb73d02b0510e9bdb5d5720b5c493dcbd'
    ],
    'Label': [
        '0x Allowance Holder',
        'Bunni Arb Bot',
        'MEV Bot (0x5093ef)',
        'MEV Bot (0x2d5805)',
        'Relay Router',
        '0x MetaTxn Settler',
        'CowSwap',
        '1inch Filler (?)',
        'MEV Bot (0xacff4c)',
        'UniswapX Filler (0x7ae782)'
    ],
    'Category': [
        'Retail',
        'Bunni Bot',
        'MEV Bot',
        'MEV Bot',
        'Retail',
        'Retail',
        'Retail',
        'Retail',
        'MEV Bot',
        'Retail'
    ],
    'Volume (USD)': [
        clean_volume('$904,187.4019'),
        clean_volume('$627,829.7428'),
        clean_volume('$393,876.7221'),
        clean_volume('$337,890.7363'),
        clean_volume('$314,248.0644'),
        clean_volume('$77,477.6516'),
        clean_volume('$64,488.1250'),
        clean_volume('$45,321.3753'),
        clean_volume('$43,031.7328'),
        clean_volume('$33,805.0906')
    ],
    'Swaps': [8176, 2183, 3482, 2483, 7182, 616, 735, 391, 439, 252],
    '% of Pool Volume': [28.92, 20.08, 12.60, 10.81, 10.05, 2.48, 2.06, 1.45, 1.38, 1.08]
})

categories_A = pd.DataFrame({
    'Volume (USD)': [
        clean_volume('$1,635,511.71'),
        clean_volume('$627,829.74'),
        clean_volume('$782,673.49'),
        clean_volume('$80,715.16')
    ],
    'Percentage': [52.31, 20.08, 25.03, 2.58]
}, index=['Retail', 'Bunni Bot', 'MEV Bot', 'Unknown'])

# Experiment B data
routers_B = pd.DataFrame({
    'Rank': range(1, 11),
    'Router Address': [
        '0x0000000000001ff3684f28c67538d4d072c22734',
        '0xeeeeee9ec4769a09a76a83c7bc42b185872860ee',
        '0x5093ef099346ffe58283207e221dada47bfd862a',
        '0x9008d19f58aabd9ed0d60971565aa8510560ab41',
        '0x2d5805a423d6ce771f06972ad4499f120902631a',
        '0xf1ceb16d94083606db7f4d98400554f17125483b',
        '0xaaaaaaae92cc1ceef79a038017889fdd26d23d4d',
        '0xfb33f10738d6e83a049678c1fcb9eb8b78d1417f',
        '0x5c9bdc801a600c006c388fc032dcb27355154cc9',
        '0x7ae782dcb73d02b0510e9bdb5d5720b5c493dcbd'
    ],
    'Label': [
        '0x Allowance Holder',
        'Relay Router',
        'MEV Bot (0x5093ef)',
        'CowSwap',
        'MEV Bot (0x2d5805)',
        '1inch Filler (?)',
        'Relay Approval Proxy',
        '0x MetaTxn Settler',
        '0x Settler',
        'UniswapX Filler (0x7ae782)'
    ],
    'Category': [
        'Retail',
        'Retail',
        'MEV Bot',
        'Retail',
        'MEV Bot',
        'Retail',
        'Retail',
        'Retail',
        'Retail',
        'Retail'
    ],
    'Volume (USD)': [
        clean_volume('$13,358.4205'),
        clean_volume('$11,700.6714'),
        clean_volume('$3,214.9879'),
        clean_volume('$3,043.4063'),
        clean_volume('$1,407.3451'),
        clean_volume('$1,215.4335'),
        clean_volume('$1,128.8171'),
        clean_volume('$764.4168'),
        clean_volume('$671.7069'),
        clean_volume('$543.3051')
    ],
    'Swaps': [1315, 3291, 361, 315, 156, 102, 194, 57, 163, 34],
    '% of Pool Volume': [32.29, 28.28, 7.77, 7.36, 3.40, 2.94, 2.73, 1.85, 1.62, 1.31]
})

categories_B = pd.DataFrame({
    'Volume (USD)': [
        clean_volume('$35,687.20'),
        clean_volume('$5,056.04'),
        clean_volume('$631.71')
    ],
    'Percentage': [86.25, 12.22, 1.53]
}, index=['Retail', 'MEV Bot', 'Unknown'])

# Experiment C data
routers_C = pd.DataFrame({
    'Rank': range(1, 11),
    'Router Address': [
        '0x0000000000001ff3684f28c67538d4d072c22734',
        '0xeeeeee9ec4769a09a76a83c7bc42b185872860ee',
        '0x5093ef099346ffe58283207e221dada47bfd862a',
        '0x9008d19f58aabd9ed0d60971565aa8510560ab41',
        '0x2d5805a423d6ce771f06972ad4499f120902631a',
        '0xf1ceb16d94083606db7f4d98400554f17125483b',
        '0xaaaaaaae92cc1ceef79a038017889fdd26d23d4d',
        '0xfb33f10738d6e83a049678c1fcb9eb8b78d1417f',
        '0xacff4cabde48944b89eb652a3b90e7bcef7dddac',
        '0x5c9bdc801a600c006c388fc032dcb27355154cc9'
    ],
    'Label': [
        '0x Allowance Holder',
        'Relay Router',
        'MEV Bot (0x5093ef)',
        'CowSwap',
        'MEV Bot (0x2d5805)',
        '1inch Filler (?)',
        'Relay Approval Proxy',
        '0x MetaTxn Settler',
        'MEV Bot (0xacff4c)',
        '0x Settler'
    ],
    'Category': [
        'Retail',
        'Retail',
        'MEV Bot',
        'Retail',
        'MEV Bot',
        'Retail',
        'Retail',
        'Retail',
        'MEV Bot',
        'Retail'
    ],
    'Volume (USD)': [
        clean_volume('$9,092.3906'),
        clean_volume('$7,140.1790'),
        clean_volume('$2,319.3960'),
        clean_volume('$1,777.1019'),
        clean_volume('$1,469.6035'),
        clean_volume('$857.4272'),
        clean_volume('$543.5118'),
        clean_volume('$494.5793'),
        clean_volume('$437.4292'),
        clean_volume('$413.9482')
    ],
    'Swaps': [954, 2629, 282, 198, 138, 87, 113, 46, 59, 107],
    '% of Pool Volume': [33.52, 26.32, 8.55, 6.55, 5.42, 3.16, 2.00, 1.82, 1.61, 1.53]
})

categories_C = pd.DataFrame({
    'Volume (USD)': [
        clean_volume('$22,351.53'),
        clean_volume('$4,226.43'),
        clean_volume('$546.35')
    ],
    'Percentage': [82.40, 15.58, 2.01]
}, index=['Retail', 'MEV Bot', 'Unknown'])

# Create all visualizations
fig_A = visualize_experiment(routers_A, categories_A, 'A')
fig_B = visualize_experiment(routers_B, categories_B, 'B')
fig_C = visualize_experiment(routers_C, categories_C, 'C')

# Create a combined comparison of just the category breakdowns
fig, axes = plt.subplots(1, 3, figsize=(18, 6))
fig.suptitle('Comparison of Volume Distribution Across Experiments', fontsize=18, fontweight='bold')

# Color mapping for categories
category_colors = {
    'Retail': '#3366CC',    # Blue
    'MEV Bot': '#FF9933',   # Orange
    'Bunni Bot': '#33CC99', # Teal
    'Unknown': '#CCCCCC'    # Gray
}

# Pie charts for each experiment
for i, (ax, data, exp_name) in enumerate(zip(axes, [categories_A, categories_B, categories_C], ['A', 'B', 'C'])):
    colors = [category_colors[cat] for cat in data.index]
    wedges, texts, autotexts = ax.pie(
        data['Volume (USD)'],
        labels=None,
        autopct='%1.1f%%',
        startangle=90,
        colors=colors
    )
    
    for autotext in autotexts:
        autotext.set_fontsize(10)
        autotext.set_fontweight('bold')
    
    ax.set_title(f'Experiment {exp_name}', fontsize=14, fontweight='bold')
    
    # Only add legend to the last pie chart
    if i == 2:
        ax.legend(wedges, data.index, loc='center left', bbox_to_anchor=(1, 0.5))

plt.tight_layout()
plt.savefig('bunni_experiment_comparison.png', dpi=300, bbox_inches='tight')

# Create a vertical bar chart comparison showing retail vs MEV percentages
fig, ax = plt.subplots(figsize=(12, 8))

# Prepare data for comparison
experiments = ['Experiment A', 'Experiment B', 'Experiment C']
retail_percentages = [52.31, 86.25, 82.40]
mev_percentages = [25.03, 12.22, 15.58]
bunni_percentages = [20.08, 0, 0]  # Only Experiment A has Bunni Bot
unknown_percentages = [2.58, 1.53, 2.01]

# Set width of bars
bar_width = 0.2
index = np.arange(len(experiments))

# Create bars
retail_bars = ax.bar(index - bar_width*1.5, retail_percentages, bar_width, 
                    label='Retail', color=category_colors['Retail'])
mev_bars = ax.bar(index - bar_width/2, mev_percentages, bar_width, 
                 label='MEV Bot', color=category_colors['MEV Bot'])
bunni_bars = ax.bar(index + bar_width/2, bunni_percentages, bar_width, 
                   label='Bunni Bot', color=category_colors['Bunni Bot'])
unknown_bars = ax.bar(index + bar_width*1.5, unknown_percentages, bar_width, 
                     label='Unknown', color=category_colors['Unknown'])

# Add labels and title
ax.set_xlabel('Experiment', fontsize=14, fontweight='bold')
ax.set_ylabel('Percentage of Volume (%)', fontsize=14, fontweight='bold')
ax.set_title('Volume Distribution by Category Across Experiments', fontsize=18, fontweight='bold')
ax.set_xticks(index)
ax.set_xticklabels(experiments)
ax.legend()

# Add percentage labels on bars
def add_labels(bars):
    for bar in bars:
        height = bar.get_height()
        if height > 0:  # Only add labels for non-zero values
            ax.text(bar.get_x() + bar.get_width()/2., height + 1,
                   f'{height:.1f}%',
                   ha='center', va='bottom', fontweight='bold')

add_labels(retail_bars)
add_labels(mev_bars)
add_labels(bunni_bars)
add_labels(unknown_bars)

# Add insight annotation
ax.annotate(
    'Experiments B & C have\nsignificantly higher retail volume %',
    xy=(1, 84),
    xytext=(1.3, 70),
    fontsize=11,
    fontweight='bold',
    arrowprops=dict(arrowstyle='->', connectionstyle='arc3,rad=.2', color='black')
)

ax.annotate(
    'Experiment A has significant\nvolume from Bunni Bot (20.1%)',
    xy=(0, 20),
    xytext=(-0.3, 35),
    fontsize=11,
    fontweight='bold',
    arrowprops=dict(arrowstyle='->', connectionstyle='arc3,rad=-.2', color='black')
)

# Add grid and adjust layout
ax.grid(axis='y', linestyle='--', alpha=0.7)
ax.set_ylim(0, 100)  # Set y-axis to percentage scale

# Add Bunni branding
plt.figtext(0.95, 0.03, "bunni.xyz", fontsize=14, fontweight='bold', color='#666666', ha='right')

plt.tight_layout()
plt.savefig('bunni_volume_comparison_bar.png', dpi=300, bbox_inches='tight')

print("Visualizations created successfully!")