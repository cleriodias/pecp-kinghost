<?php

namespace App\Models;

use App\Models\Produto;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductDiscard extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_id',
        'user_id',
        'unit_id',
        'quantity',
        'unit_price',
    ];

    protected $casts = [
        'unit_id' => 'integer',
        'quantity' => 'float',
        'unit_price' => 'float',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Produto::class, 'product_id', 'tb1_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unidade::class, 'unit_id', 'tb2_id');
    }
}
