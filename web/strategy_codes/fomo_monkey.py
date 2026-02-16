# FOMO Monkey: Buy when volume spikes (everyone's buying!), panic sell on drops

cash, position, FEE = 10000, 0, 0.001
prev_close = None
prev_volume = None

for close, volume in data:  # data = [(close, volume), ...]
    
    if prev_close and prev_volume:
        price_change = (close - prev_close) / prev_close
        volume_spike = volume > prev_volume * 1.5  # 50% volume increase
        
        if volume_spike and price_change > 0:  # FOMO! Everyone buying!
            if cash > 0:
                position = cash * (1 - FEE) / close
                cash = 0
        elif price_change < -0.02:  # 2% drop = PANIC SELL!
            if position > 0:
                cash = position * close * (1 - FEE)
                position = 0
    
    prev_close = close
    prev_volume = volume

final = cash + position * data[-1][0]
