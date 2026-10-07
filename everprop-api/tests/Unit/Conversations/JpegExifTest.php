<?php

namespace Tests\Unit\Conversations;

use App\Domain\Conversations\Services\ConversationAttachments;
use PHPUnit\Framework\TestCase;

/** Photos lose their EXIF block (GPS, device) without being re-encoded. */
final class JpegExifTest extends TestCase
{
    private static function segment(int $marker, string $data): string
    {
        return "\xFF".chr($marker).pack('n', strlen($data) + 2).$data;
    }

    public function test_the_exif_block_is_removed_and_everything_else_is_kept_byte_for_byte(): void
    {
        $jfif = self::segment(0xE0, "JFIF\x00\x01\x01");
        $exif = self::segment(0xE1, "Exif\x00\x00GPS -24.1858,-65.2995 iPhone");
        $xmp = self::segment(0xE1, 'http://ns.adobe.com/xap/1.0/');
        $scan = self::segment(0xDA, "\x01\x02")."\x12\x34\xFF\x00\x56\xFF\xD9";

        $clean = ConversationAttachments::withoutExif("\xFF\xD8".$jfif.$exif.$xmp.$scan);

        $this->assertSame("\xFF\xD8".$jfif.$xmp.$scan, $clean);
        $this->assertStringNotContainsString('-24.1858', $clean);
    }

    public function test_anything_that_is_not_a_well_formed_jpeg_is_returned_untouched(): void
    {
        foreach (['not a jpeg', "\xFF\xD8\xFF\xE1\x00", "\xFF\xD8\xFF\xE1\xFF\xFFExif"] as $bytes) {
            $this->assertSame($bytes, ConversationAttachments::withoutExif($bytes));
        }
    }
}
