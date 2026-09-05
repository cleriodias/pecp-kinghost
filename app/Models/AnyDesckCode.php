<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AnyDesckCode extends Model
{
    use HasFactory;

    protected $table = 'tb23_anydesck_codigos';

    protected $fillable = [
        'unit_id',
        'code',
        'type',
    ];

    protected $casts = [
        'unit_id' => 'integer',
    ];

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unidade::class, 'unit_id', 'tb2_id');
    }
}
