<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChatMessage extends Model
{
    use HasFactory;

    protected $table = 'tb22_chat_mensagens';

    protected $fillable = [
        'sender_id',
        'recipient_id',
        'sender_role',
        'sender_unit_id',
        'message',
        'read_at',
    ];

    protected function casts(): array
    {
        return [
            'sender_id' => 'integer',
            'recipient_id' => 'integer',
            'sender_role' => 'integer',
            'sender_unit_id' => 'integer',
            'read_at' => 'datetime',
        ];
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    public function recipient(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recipient_id');
    }

    public function senderUnit(): BelongsTo
    {
        return $this->belongsTo(Unidade::class, 'sender_unit_id', 'tb2_id');
    }
}
