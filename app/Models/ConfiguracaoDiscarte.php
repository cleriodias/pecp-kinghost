<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ConfiguracaoDiscarte extends Model
{
    use HasFactory;

    protected $table = 'tb_17_configuracao_descarte';

    protected $fillable = [
        'percentual_aceitavel',
    ];

    protected $casts = [
        'percentual_aceitavel' => 'float',
    ];
}
