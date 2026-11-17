resource "aws_iam_policy" "tfe_env" {
  name        = "${local.app}-policy"
  path        = "/"
  description = "Policy for tfe-env application's Route53 operations"

  policy = jsonencode(
    {
      Version = "2012-10-17",
      Statement : [
        {
          Effect = "Allow",
          Sid    = "AllowRoute53ZoneReadAccess"
          Action = [
            "route53:ListHostedZonesByName",
            "route53:GetChange"
          ],
          Resource = "*"
        },
        {
          Effect = "Allow",
          Sid    = "AllowRoute53RecordSetsAccess"
          Action = [
            "route53:ChangeResourceRecordSets"
          ],
          Resource = "arn:aws:route53:::hostedzone/${data.aws_route53_zone.selected.zone_id}",
          Condition = {
            "ForAllValues:StringLike" = {
              "route53:ChangeResourceRecordSetsNormalizedRecordNames" = ["_acme-challenge.*"]
            }
            "ForAllValues:StringEquals" = {
              "route53:ChangeResourceRecordSetsRecordTypes" = ["TXT"]
              "route53:ChangeResourceRecordSetsActions"     = ["UPSERT", "DELETE"]
            }
          }
        }
      ]
    }
  )
}

resource "aws_iam_role" "tfe_env" {
  name = "${local.app}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      },
    ]
  })

  tags = {
    Name = "${local.app}-role"
  }
}

resource "aws_iam_role_policy_attachment" "tfe_env" {
  role       = aws_iam_role.tfe_env.name
  policy_arn = aws_iam_policy.tfe_env.arn
}

resource "aws_iam_instance_profile" "tfe_env" {
  name = "${local.app}-profile"
  role = aws_iam_role.tfe_env.name
}
