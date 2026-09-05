<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('newsletter_notices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('newsletter_subscription_id')
                ->nullable()
                ->constrained('newsletter_subscriptions')
                ->nullOnDelete();
            $table->string('name');
            $table->string('phone', 30);
            $table->text('message');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('newsletter_notices');
    }
};
